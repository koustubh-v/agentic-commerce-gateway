

## 1. The Money-Action Gate — bounded, gated, explainable

Every payment action passes through a synchronous gate **before** any call to Razorpay is made. This gate is a separate module, not scattered `if` checks, so it's independently auditable.

**Bounded — define limits as explicit policy objects, not code:**
- Per-transaction cap (e.g. ₹10,000 max per checkout)
- Per-agent-session cap (cumulative spend an agent can authorize in one session)
- Velocity cap (max N transactions or ₹X per hour per merchant/agent pair)
- SKU/category allowlist (agent can only transact on products the merchant explicitly exposed as "agent-purchasable")
- Currency/amount-drift check (does the amount the agent is requesting match what your IR's cart actually totals to, recomputed server-side — never trust the agent's stated number)

**Gated — the gate produces one of three outcomes, never a silent pass-through:**
`APPROVED`, `REJECTED`, or `REQUIRES_STEP_UP` (e.g. amount is borderline, ask for explicit human confirmation before proceeding).

**Explainable — every gate decision writes a structured reason, not a boolean:**
```json
{
  "decision": "REJECTED",
  "rule": "per_transaction_cap",
  "limit": 10000,
  "requested": 15000,
  "message": "Cart total ₹15,000 exceeds the ₹10,000 per-transaction limit set by merchant policy for agent-initiated purchases."
}
```
This reason string is what gets shown to the user/agent, and it's also what gets written to the audit trail. If you can't explain *why* a payment was allowed or blocked in one sentence, the gate isn't done.

## 2. Audit trail design — append-only, event-sourced

Don't model this as "update the order row's status column." Model it as an **immutable event log**, one row per state transition, and derive current status by folding the events. This is the only design that gives you a real audit trail instead of a snapshot that overwrites history.

```
transaction_events
─────────────────────────────────────────
id               (uuid, pk)
transaction_id   (uuid, groups events)
event_type       (INTENT_CREATED, BOUNDS_CHECKED, GATE_DECISION,
                   PSP_INITIATED, PSP_WEBHOOK_RECEIVED, RECONCILED,
                   FULFILLED, FAILED, REFUNDED)
actor            (agent_id / session_id / "system:reconciler")
payload          (jsonb — amounts, reasons, PSP references)
correlation_id   (ties agent request → PSP call → webhook together)
created_at       (immutable, never updated)
prev_hash        (optional: sha256 of previous event, for tamper evidence)
```

Every write is `INSERT`, never `UPDATE`. Current transaction status = latest event in the chain. This gives you, for free:
- A complete replay of what happened and why, for any transaction
- Tamper evidence if you add the hash chain
- A natural place to answer "why did this fail" — just read the events in order

## 3. Transaction state machine

```
INTENT_CREATED
   │
   ▼
BOUNDS_CHECK ──(fail)──► REJECTED (terminal, no PSP call made)
   │ (pass)
   ▼
GATE_APPROVED
   │
   ▼
PSP_INITIATED ──(timeout/network error)──► UNCERTAIN → reconcile via status poll
   │ (response received)
   ▼
PSP_PENDING
   │
   ├──(webhook: success)──► PSP_SUCCEEDED ──► FULFILLMENT_TRIGGERED ──► SETTLED
   ├──(webhook: failure)──► PSP_FAILED (terminal, explain + release stock hold)
   └──(no webhook in N min)──► RECONCILIATION_JOB polls Razorpay order status directly
```

The key design decision: **`REJECTED` never touches the PSP at all.** Money-safety starts before the network call, not after.

## 4. Payment failure taxonomy — handle each distinctly

| Failure mode | Detection | Handling |
|---|---|---|
| Card declined / insufficient funds | Synchronous PSP response | Terminal failure, explain to agent verbatim from Razorpay's decline reason, release any stock hold, no retry |
| Network timeout calling Razorpay | Request throws/times out | **Never blindly retry.** State becomes `UNCERTAIN`. Poll Razorpay's order-status API with the idempotency key before deciding anything. Money may have moved even if your HTTP call "failed." |
| Webhook never arrives | No `PSP_WEBHOOK_RECEIVED` event within timeout window | Reconciliation job (cron, every 1-2 min) polls Razorpay directly for any `PSP_PENDING` transaction older than threshold |
| Webhook arrives twice | Duplicate `event_id` from Razorpay | Unique constraint on `(psp_event_id)` — second insert fails silently, handler is idempotent by construction |
| Payment succeeded, merchant fulfillment call fails | Fulfillment webhook to merchant errors/times out | Separate saga step with retry + exponential backoff + dead-letter queue after N attempts; **money is already settled, this is now an operational alert, not a payment failure** |
| Agent retries checkout due to its own timeout | Same idempotency key reused | Return the existing transaction's current state instead of creating a second charge |
| Amount drift (agent says ₹500, real cart total is ₹650) | Server-side recompute at gate stage | Reject before PSP call, force re-confirmation with corrected amount — never trust client-stated totals |
| DB write fails right after PSP call succeeds | App crash / DB down mid-request | This is the worst case — solved by the outbox pattern below, not by hoping it doesn't happen |

## 5. Bidirectionality — this is where most designs quietly break

Checkout is inherently asynchronous: the agent initiates, but confirmation comes back on Razorpay's timeline via webhook, and fulfillment status comes back on the merchant's timeline too. Your layer sits in the middle of **two independent inbound directions** and needs to fan status back out.

- **Agent → your layer → Razorpay**: standard forward flow, scoped token, gate check
- **Razorpay → your layer**: webhook on payment success/failure — must be idempotent (dedup on event ID), must be signature-verified (HMAC), and must trigger the next saga step (notify merchant, notify agent)
- **Merchant → your layer**: fulfillment/cancellation webhooks — merchant later cancels an order, or fulfillment fails on their end — this must also propagate back
- **Your layer → Agent**: since the agent isn't holding a connection open through a human completing a payment page, it needs a way to get the final answer. Two options, support both: agent polls a `get_transaction_status(id)` MCP tool, or agent registers a `callback_url` at checkout-creation time and you push a signed webhook to it on every state change

Treat "notify the agent" and "notify the merchant" as two independent fan-out targets off the same event log — not two different code paths. Every event in `transaction_events` should have subscribers, not be handled inline.

## 6. Database concurrency

Three separate concurrency problems, each needs its own mechanism:

**a) Stock race condition (two buyers, last unit)**
Never do read-then-write in application code (`if stock > 0: decrement`). Use an atomic conditional update at the DB level:
```sql
UPDATE inventory SET stock = stock - 1
WHERE product_id = ? AND stock > 0
RETURNING stock;
```
If zero rows return, the gate rejects with `"out_of_stock"` — explainable, no race window. This single statement is your concurrency control; no `SELECT FOR UPDATE` needed for a simple decrement.

**b) Idempotency on retries**
Every checkout request carries a client-generated `idempotency_key`. Unique constraint on `(idempotency_key)` in the transactions table. A retried request with the same key returns the existing transaction instead of creating a new one — this is non-negotiable for anything that touches money.

**c) The distributed transaction problem (PSP call + local DB are two separate systems)**
You cannot wrap "call Razorpay" and "update local DB" in one ACID transaction — they're different systems. Use the **outbox pattern**:
1. In one local DB transaction: insert the `PSP_INITIATED` event AND a row in an `outbox` table saying "call Razorpay with this payload"
2. A separate worker reads the outbox and makes the actual Razorpay call
3. If the app crashes between steps, the outbox row is still there — a recovery worker picks it up

This guarantees you never lose the *intent* to call Razorpay, even if the process dies right after committing. It's the fix for "DB write fails right after PSP call succeeds" — you flip the order: **write intent first, then call PSP, then write result** — never call PSP first and record afterward.

**d) Cart concurrent modification**
Optimistic concurrency: cart has a `version` column, every update does `WHERE id = ? AND version = ?`, bump version on write. If zero rows affected, someone else modified it first — reload and re-present to the agent rather than silently overwriting.

## 7. Worked example: one failure, handled gracefully end to end

**Scenario:** Agent initiates a ₹2,500 checkout. Razorpay's response times out at the network level (request sent, but your server never got a response before the connection dropped).

```
1. INTENT_CREATED     actor=agent_47  payload={cart_total: 2500, idempotency_key: "abc123"}
2. BOUNDS_CHECKED      decision=APPROVED  rule=per_transaction_cap (limit ₹10,000, ok)
3. GATE_APPROVED       reason="Within transaction and velocity limits"
4. OUTBOX_WRITTEN      payload={psp: razorpay, amount: 2500, idempotency_key: "abc123"}
5. PSP_INITIATED       correlation_id=xyz  (Razorpay call sent)
   ⚠ network timeout — no HTTP response received
6. STATE=UNCERTAIN     reason="No response from PSP within 8s; reconciling before retry"
7. RECONCILIATION_JOB  polls Razorpay GET /orders/{id} using idempotency_key
   → Razorpay confirms: order exists, payment_status=captured
8. PSP_SUCCEEDED       reason="Reconciliation confirmed payment captured despite client-side timeout"
9. FULFILLMENT_TRIGGERED  → merchant webhook called, ack received
10. SETTLED            final state
```

What the agent sees if it polls mid-flow: a clear status of `"reconciling"` with the explanation *"Payment may have completed; verifying with payment provider before confirming — do not retry the charge."* That single sentence is the difference between a graceful failure and a double-charge. The agent is explicitly told not to retry, because the idempotency key already guarantees a retry would be a no-op anyway — but telling it *why* is what makes the system trustworthy to whoever's evaluating it.

The one design rule underneath all of this: **write down what you're about to do before you do it, so a crash mid-action leaves a trail instead of a mystery.** That's what makes every step above both auditable and recoverable.