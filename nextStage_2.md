Everything up to Razorpay's `payment.authorized` webhook firing is the hard part, and it's done. What's left is the part that actually earns the "graceful failure" and "bidirectional" requirements: the outbox worker that drains, the webhook handlers that consume, the reconciliation job that catches what both miss, and finishing the ACP surface so it's not just create-and-poll. Here's the exact next-stage plan, matching your file layout.

## A. Outbox Dispatcher Worker (missing engine piece)

You have the Outbox table and the pattern documented, but nothing's said to be draining it yet. This is a standalone worker process, not inline in the request handler — that's the whole point of the pattern.

`src/workers/outboxDispatcher.ts`
```typescript
async function dispatchLoop() {
  while (true) {
    const pending = await db.outbox.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    for (const entry of pending) {
      try {
        await db.outbox.update({ where: { id: entry.id }, data: { status: 'PROCESSING' } });
        const result = await razorpay.orders.create(entry.payload); // idempotency_key inside payload
        await db.transactionEvent.create({
          data: { transactionId: entry.transactionId, eventType: 'PSP_INITIATED',
                   payload: result, razorpayEventId: result.id }
        });
        await db.outbox.update({ where: { id: entry.id }, data: { status: 'DONE' } });
      } catch (err) {
        await handleOutboxFailure(entry, err); // stage C ties in here
      }
    }
    await sleep(2000);
  }
}
```
Key rule: **increment an `attempts` counter and back off exponentially** (2s, 4s, 8s...); after N attempts, flip `status: 'DEAD_LETTER'` and alert rather than looping forever. This single worker is what turns your Outbox table from a schema into a working guarantee.

## B. Webhook Handlers (`src/webhooks/razorpay.ts`)

Four handlers, each idempotent by `razorpayEventId` uniqueness on `transaction_events`.

```typescript
router.post('/webhooks/razorpay', async (req, res) => {
  if (!verifyHmac(req.body, req.headers['x-razorpay-signature'], webhookSecret)) {
    return res.status(400).send('invalid signature');
  }
  const event = req.body;
  const dupe = await db.transactionEvent.findUnique({ where: { razorpayEventId: event.id } });
  if (dupe) return res.status(200).send('already processed'); // idempotent no-op

  switch (event.event) {
    case 'payment.authorized': return onAuthorized(event);
    case 'payment.captured':   return onCaptured(event);
    case 'payment.failed':     return onFailed(event);
    case 'refund.processed':   return onRefunded(event);
  }
  res.status(200).send('ok');
});
```

`onAuthorized` is the one you already designed conceptually — make sure it's the actual pre-capture gate call, not just the description of it:
```typescript
async function onAuthorized(event) {
  const intent = await findPaymentIntentByOrderId(event.payload.order.entity.id);
  await logEvent(intent, 'PSP_WEBHOOK_RECEIVED', event);

  const preCapture = await runPreCaptureGate(intent);
  await logEvent(intent, 'GATE_DECISION_PRE_CAPTURE', preCapture);

  if (preCapture.decision !== 'APPROVED') {
    await logEvent(intent, 'CAPTURE_SKIPPED', preCapture.reason);
    await releaseInventoryLock(intent.cartId);
    return; // funds auto-release on Razorpay capture timeout, no action needed
  }

  await razorpay.payments.capture(event.payload.payment.entity.id, event.payload.payment.entity.amount);
  await logEvent(intent, 'PSP_CAPTURED', {});
  await triggerFulfillmentSaga(intent); // stage D
}
```

`onFailed` and `onRefunded` just log terminal states and release locks — no gate logic needed, they're already-decided outcomes flowing back into your system. This is also your **bidirectional** requirement satisfied: Razorpay → you is this handler; you → merchant is the fulfillment saga; you → agent is the callback push (stage E).

## C. Reconciliation Job (`src/workers/reconciler.ts`)

Catches everything webhooks miss — dropped webhook, outbox stuck in `PROCESSING` from a crashed worker, or a payment that moved but your side never heard about it.

```typescript
async function reconcile() {
  const stale = await db.paymentIntent.findMany({
    where: { status: 'PSP_INITIATED', updatedAt: { lt: minutesAgo(2) } }
  });

  for (const intent of stale) {
    const order = await razorpay.orders.fetch(intent.razorpayOrderId);
    const payments = await razorpay.orders.fetchPayments(intent.razorpayOrderId);
    const actual = derivePaymentState(payments); // 'none' | 'authorized' | 'captured' | 'failed'

    await logEvent(intent, 'RECONCILED', { source: 'reconciliation_job', actual });

    if (actual === 'authorized' && intent.status === 'PSP_INITIATED') {
      await onAuthorized(synthesizeEventFromOrder(order)); // replay through the same path as the webhook
    } else if (actual === 'none' && olderThan(intent, minutesAgo(10))) {
      await logEvent(intent, 'ABANDONED', { reason: 'no PSP action within window' });
      await releaseInventoryLock(intent.cartId);
    }
  }

  // also sweep dead outbox entries older than N attempts for manual review
  const deadLetters = await db.outbox.findMany({ where: { status: 'DEAD_LETTER' } });
  if (deadLetters.length) await alertOps(deadLetters);
}
```
Run this on a cron (every 60–90s). The important design point: **reconciliation replays through the exact same `onAuthorized` function** the webhook uses — one code path for "how does an authorized payment get captured," triggered by two different sources. Never duplicate that logic between webhook handler and reconciler.

## D. Fulfillment Saga & Compensation (post-capture failure)

This is the failure mode your current docs don't cover yet: **money captured successfully, but notifying the merchant to actually ship/fulfill fails.** Money is already settled, so this is not a payment failure — it needs retry, not rollback.

```typescript
async function triggerFulfillmentSaga(intent) {
  await db.outbox.create({
    data: { type: 'FULFILLMENT_NOTIFY', payload: { orderId: intent.orderId, merchantId: intent.merchantId },
            status: 'PENDING' }
  });
}

// separate dispatcher, same pattern as stage A, but with a dead-letter alert instead of a payment retry,
// since retrying a capture would be wrong here — the money side is already done.
```
Only trigger an actual **refund** compensation if fulfillment is *provably impossible* (e.g., merchant explicitly cancels via their own webhook after capture) — never auto-refund just because a notification call timed out. That distinction is worth stating explicitly in your architecture doc; it shows judges you understand that "payment failure" and "fulfillment failure" need different recovery strategies.

## E. Finish the ACP Renderer

You have `/feed`, `POST /checkout_sessions`, `GET /checkout_sessions/:id`. ACP spec needs the remaining state-mutating verbs — build them as thin wrappers over your existing commerce functions, nothing new:

```typescript
// PATCH /checkout_sessions/:id — e.g. quantity change before payment
router.patch('/checkout_sessions/:id', async (req, res) => {
  const result = await commerceUpdateCart(req.params.id, req.body.items);
  res.json(toAcpSessionShape(result)); // includes fresh stateHash
});

// POST /checkout_sessions/:id/complete — agent confirms after user pays
router.post('/checkout_sessions/:id/complete', async (req, res) => {
  const status = await getTransactionStatus(req.params.id);
  res.json(toAcpSessionShape(status));
});

// POST /checkout_sessions/:id/cancel
router.post('/checkout_sessions/:id/cancel', async (req, res) => {
  await commerceCancelCheckout(req.params.id); // releases inventory lock, logs CANCELLED event
  res.json({ status: 'cancelled' });
});
```

**Add the push side of bidirectionality here too** — ACP and MCP agents shouldn't have to poll forever:
```typescript
// at checkout_sessions creation, accept an optional callback_url
// when TransactionEvent moves to PSP_CAPTURED / PSP_FAILED / REFUNDED, fan out:
async function notifyAgentCallback(intent, event) {
  if (!intent.callbackUrl) return;
  await signedPost(intent.callbackUrl, { transactionId: intent.id, status: event.type, reason: event.payload });
}
```
Call this from the same `logEvent` function everything else already goes through, so every subsystem (audit log, agent callback, ops alerting) is just a subscriber on one event stream instead of scattered calls.

## F. The one graceful-failure demo (script it now, not later)

Given your infra, the most convincing sequence to record:
1. Agent A adds the last unit of a SKU to cart → inventory lock acquired, `stateHash` issued
2. Agent A calls `initiate_checkout` → Gate approves → Razorpay order created, `payment_capture: 0`
3. **Before Agent A pays**, simulate a merchant-side stock correction (manual DB update or a second real purchase) that invalidates the reservation
4. Agent A completes payment on Razorpay → `payment.authorized` webhook fires
5. `runPreCaptureGate` re-checks inventory → finds it gone → **capture is skipped**
6. Show: `transaction_events` log with `GATE_DECISION_PRE_CAPTURE: REJECTED, reason: "inventory depleted between authorization and capture"` → Razorpay dashboard showing the payment sitting `authorized`, not `captured` → auto-refund firing on timeout
7. Agent receives the structured error via `get_transaction_status`, not a raw exception — shows it saying something coherent to the end user instead of hallucinating

This demo touches almost every piece you built — state hash, gate (twice), outbox, audit trail, webhook, reconciliation-adjacent logic — in one 90-second sequence.

## G. Fast hardening pass (do these, they're cheap and judges will check)

- Rate limit per `agentId` on all MCP tools and ACP routes (even a simple token bucket in Redis)
- Confirm catalog data returned to agents is always structured JSON fields, never raw HTML/free-text descriptions injected unsanitized — closes the prompt-injection vector from the report with work you've likely already done via the IR
- Verify every Redis session/cart key is scoped by `agentId` + `cartId`, never global, so no cross-session leakage

## H. Minimum test checklist before recording

- Retry `initiate_checkout` twice with the same `idempotencyKey` → confirm only one Razorpay order exists
- Fire the same webhook payload twice → confirm only one `PSP_CAPTURED` event logged
- Two concurrent `add_to_cart` calls on the last unit → confirm exactly one succeeds
- Kill the outbox worker mid-drain, restart it → confirm the pending entry still gets processed, not lost or duplicated

Do A–C first (they're the actual "Failure + Reconciliation" stage you named), then E for a complete ACP surface, then F as your recording script, with G/H as time permits before the deadline.