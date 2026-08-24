Since the translation layer (catalog discovery) is done, everything left is about **money**, and money code has zero tolerance for "roughly right." Here's the build order and the exact implementation detail for each stage, in dependency order.

## Build order (why this sequence matters)

```
Commerce State & Action Layer  →  Money-Action Gate  →  Razorpay Integration
        →  Audit Trail (wraps all of the above)  →  Failure + Reconciliation  →  ACP Renderer (last)
```

The Gate and the Audit Trail aren't separate features bolted on — they're **interceptors around every state transition** in the Commerce layer. Build the state machine first with the gate as a no-op stub, wire real Razorpay calls second, then harden with reconciliation. ACP Renderer goes last because it's just another view over the same IR you're about to build — building it early would mean re-doing it once the state machine settles.

---

## 1. Commerce State & Action Layer

This is the stateful core that both your MCP tools and (later) ACP endpoints read/write. Two things to get right: the schema, and the cryptographic cart-state binding that stops the TOCTOU price-race the PDF flagged.

**Schema:**
```sql
carts (
  id UUID PK, merchant_id, agent_id, status, currency,
  version INT DEFAULT 0,          -- optimistic concurrency
  created_at, updated_at
)
cart_items (
  id UUID PK, cart_id FK, product_id, sku, quantity,
  unit_price_paise INT,           -- snapshot at add-time, not live-referenced
  added_at
)
cart_mandates (
  cart_id FK, state_hash TEXT,    -- sha256(cart_id + items + total + currency + timestamp)
  issued_at, expires_at           -- TTL, e.g. 5 min
)
```

**Why the hash matters:** when the agent calls `initiate_checkout`, you compute `state_hash = sha256(cart_id | sorted_items | total | currency)` and hand it back as part of the checkout token. When the agent later calls `confirm_payment`, it must echo that hash. If a price changed on the merchant side in between (re-fetch product, recompute hash), the hashes mismatch → reject with `"cart_state_changed"` instead of silently charging the old price. This is the direct fix for the TOCTOU attack the report describes — cheap to build, high judge-visibility.

**MCP tools to expose (state-mutating, so each wraps Gate → Audit):**
```
create_cart(merchant_id) → cart_id
add_item(cart_id, product_id, qty) → cart_snapshot + state_hash
apply_promo(cart_id, code) → cart_snapshot + state_hash
initiate_checkout(cart_id, state_hash, idempotency_key) → checkout_token
confirm_payment(checkout_token, agent_justification) → transaction_id, status
get_transaction_status(transaction_id) → status + reason
```

Every one of these is a thin function that: validates the state hash → calls the Gate → executes → appends to audit log → returns. Build them as one dispatcher so you don't duplicate the gate/audit wiring six times:

```python
def commerce_action(action_name):
    def wrapper(fn):
        def handler(*args, **kwargs):
            ctx = build_action_context(action_name, args, kwargs)
            gate_result = money_gate.evaluate(ctx)          # stage 2
            audit_log.append(ctx, "GATE_DECISION", gate_result)
            if gate_result.decision != "APPROVED":
                return explain_and_return(gate_result)
            result = fn(*args, **kwargs)                    # stage 3
            audit_log.append(ctx, f"{action_name}_EXECUTED", result)
            return result
        return handler
    return wrapper
```

This decorator pattern is what makes "every money action explainable, bounded, gated" true by construction rather than by discipline — you literally cannot add a new money-moving tool without it passing through the gate and the log.

---

## 2. Money-Action Gate

Implement as a pure policy evaluator, no side effects, no network calls — just data in, decision out. This keeps it unit-testable and demo-able in isolation (good for judges).

```python
def evaluate(ctx: ActionContext) -> GateResult:
    checks = [
        check_state_hash_valid,     # TOCTOU defense
        check_per_transaction_cap,
        check_velocity_cap,
        check_sku_allowlist,
        check_amount_matches_cart,  # never trust agent-stated total
        check_inventory_available,
    ]
    for check in checks:
        result = check(ctx)
        if result.decision != "APPROVED":
            return result   # first failure wins, short-circuit
    return GateResult(decision="APPROVED", reason="All bounds satisfied")
```

Policy limits live in a config table per merchant (not hardcoded), so the merchant onboarding step from your translation layer just adds rows here:
```json
{ "merchant_id": "m_123", "per_txn_cap_paise": 1000000, "velocity_cap_per_hour": 5, "sku_allowlist_mode": "all" }
```

Every check returns a structured reason (as discussed last time) — this is what gets embedded into the Razorpay `notes` object in the next stage, so the explainability requirement and the gate's own output are literally the same string, not two systems you have to keep in sync.

---

## 3. Razorpay Integration (two-phase commit)

**One-time setup:**
1. Dashboard → Payment Capture Settings → set to **Manual Capture**, timeout window (up to 3 days, but use something short like 15–30 min for agentic flows — funds shouldn't sit blocked long)
2. Register webhook URL, subscribe to: `payment.authorized`, `payment.captured`, `payment.failed`, `refund.processed`
3. Generate test-mode keys, store as merchant-scoped secrets (not global — each onboarded merchant has their own Razorpay account/keys)

**Phase 1 — Order creation (after Gate approves):**
```python
order = client.order.create({
    "amount": cart.total_paise,
    "currency": cart.currency,
    "receipt": cart.id,
    "payment_capture": 0,           # 0 = manual capture, this is your gate enforcement point
    "notes": {
        "agent_justification": gate_result.reason,      # from stage 2, verbatim
        "agent_identity": ctx.agent_id,
        "cart_state_hash": ctx.state_hash,
        "idempotency_key": ctx.idempotency_key
    }
})
```
`payment_capture: 0` is the whole two-phase-commit trick — Razorpay authorizes and blocks funds but does **not** move money until you explicitly call capture. That gap is your second gate check.

**Inventory TTL lock, set at the same moment:**
```python
redis.set(f"lock:sku:{sku}", order.id, ex=1800, nx=True)  # 30 min TTL, fails if already locked
```
If the `SETNX` fails, another in-flight checkout holds the item — reject at the Gate with `"item_reserved_by_another_checkout"` before ever touching Razorpay.

**Phase 2 — Webhook receives `payment.authorized`:**
```python
@webhook_handler("payment.authorized")
def on_authorized(event):
    if not verify_hmac_signature(event, webhook_secret):
        return reject("invalid_signature")
    dedup_key = event["id"]  # razorpay event id
    if audit_log.exists(dedup_key):
        return ack()  # idempotent, already processed

    ctx = load_context_from_order_notes(event.payload.order)
    # SECOND gate check — post-authorization, pre-capture
    final_check = money_gate.evaluate_pre_capture(ctx)
    audit_log.append(ctx, "PSP_WEBHOOK_RECEIVED", event)
    audit_log.append(ctx, "GATE_DECISION_PRE_CAPTURE", final_check)

    if final_check.decision == "APPROVED":
        client.payment.capture(event.payload.payment.id, event.payload.payment.amount)
        audit_log.append(ctx, "PSP_CAPTURED", {})
        release_lock_and_fulfill(ctx)
    else:
        # gate rejected between authorize and capture — funds auto-release on capture timeout
        audit_log.append(ctx, "CAPTURE_SKIPPED", final_check.reason)
        release_inventory_lock(ctx)
```

This is exactly the "unbypassable gate" pattern from the report: **funds are blocked, not moved**, and if anything looks wrong in that window (inventory sold out from under it, velocity cap breached by a concurrent request), you simply never call capture — Razorpay auto-refunds on timeout with zero manual work.

---

## 4. Append-only Audit Trail

Same event-sourced design as before, now with two concrete additions specific to this stack:

- **Dual-write the justification**: your DB event log is the queryable source of truth; the Razorpay `notes` object (max 15 keys, 256 chars each) is your tamper-resistant, judge-visible copy sitting directly on the payment entity in the Razorpay dashboard. Always write both — DB for your own reconciliation, notes for external auditability.
- **`cart_state_hash` in every event row** — lets you trace, for any transaction, exactly which cart snapshot was authorized and confirm it matches what was captured.

```sql
transaction_events (
  id UUID PK, transaction_id, event_type, actor,
  razorpay_event_id TEXT UNIQUE,   -- dedup constraint, doubles as idempotency
  payload JSONB, cart_state_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
)
```
For the demo: pull up the Razorpay dashboard payment entry side-by-side with your event log for the same transaction, and show the `agent_justification` note matches the gate's reasoning verbatim. That's the explainability requirement satisfied visually, not just architecturally.

---

## 5. Failure + Reconciliation

**Reconciliation cron (every 60–90s):**
```python
def reconcile():
    stuck = db.query("""
        SELECT * FROM transactions
        WHERE status = 'PSP_INITIATED'
        AND created_at < now() - interval '90 seconds'
    """)
    for txn in stuck:
        order = client.order.fetch(txn.razorpay_order_id)
        payments = client.order.payments(txn.razorpay_order_id)
        actual_state = derive_state(payments)  # authorized / captured / failed / none
        reconcile_local_state(txn, actual_state)  # never blindly retry the charge
```

**Semantic error mapping (never feed raw Razorpay errors to the agent):**
```python
RAZORPAY_ERROR_MAP = {
    "BAD_REQUEST_ERROR": {"code": "invalid_checkout_params", "retryable": False},
    "GATEWAY_ERROR": {"code": "payment_provider_unavailable", "retryable": True},
    "insufficient_funds": {"code": "payment_declined_funds", "retryable": False},
}
```
Your MCP tool's error response returns this structured code + a human-readable explanation, never a stack trace or raw gateway payload — this is what stops the agent from hallucinating a workaround.

**The one failure to demo (per the Buildathon brief):** mid-checkout inventory depletion. Sequence: agent A locks last unit → agent B's `add_item` fails the TTL-lock check immediately with `"item_reserved_by_another_checkout"` (clean, no Razorpay call at all) → *or*, more dramatic for video: agent A's payment gets authorized, but a manual/API-driven stock correction happens before capture → your pre-capture gate check catches it → capture skipped → Razorpay auto-refunds on timeout → audit log shows the full chain. The second version is more impressive because it proves the two-phase commit actually does something, not just a pre-check.

---

## 6. ACP Renderer (last, thin layer)

By now your Commerce layer already has canonical `Cart`/`Transaction` state with reasons attached. This stage is just mapping, no new logic:
- `/feed` → serialize your product catalog (already built in the translation layer) into ACP's feed format
- `/checkout_sessions` (create/update/get/complete/cancel) → each handler calls the *same* `create_cart` / `add_item` / `initiate_checkout` / `confirm_payment` functions from stage 1, just with ACP's JSON shape in and out
- Reuse the same Gate, same Razorpay integration, same audit log — ACP is a translation of the request/response shape, not a parallel money path. If you ever have two independent code paths that can call Razorpay, you've reintroduced the exact race conditions you just spent four stages closing.

If time is short, build ACP for `create` and `complete` only — that's enough to demo an actual conversational checkout through the standardized protocol, which is the visible payoff for all the plumbing underneath.