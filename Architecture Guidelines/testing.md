Testing an autonomous money system needs a different mindset than testing a CRUD app — you're not just checking "does it return 200," you're proving "does it behave correctly when things happen in the wrong order, at the wrong time, or twice." Here's the full setup, organized by what you're actually trying to prove to the judges.

## 1. Test environment setup (isolated from dev)

Don't test against your dev DB/Redis — a botched concurrency test can corrupt state you need for the demo.

```bash
# .env.test
DATABASE_URL=postgresql://localhost:5432/acg_test
REDIS_URL=redis://localhost:6379/1        # separate DB index from dev
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
RAZORPAY_WEBHOOK_SECRET=whsec_test_xxxxx
NODE_ENV=test
```

**Use testcontainers** so tests spin up fresh Postgres + Redis per run instead of sharing state:
```typescript
// test/setup.ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';

let pgContainer, redisContainer;
beforeAll(async () => {
  pgContainer = await new PostgreSqlContainer().start();
  redisContainer = await new RedisContainer().start();
  process.env.DATABASE_URL = pgContainer.getConnectionUri();
  process.env.REDIS_URL = redisContainer.getConnectionUrl();
  await runMigrations();
});
afterAll(async () => {
  await pgContainer.stop();
  await redisContainer.stop();
});
```
This guarantees every test run starts from zero — no leftover locks or stale carts from a previous run causing flaky failures right before your demo.

**Webhook testing needs a public URL even locally.** Use `ngrok` (or Razorpay's dashboard "Test Webhook" replay feature) so Razorpay's test-mode events can actually reach your local server:
```bash
ngrok http 3000
# register the ngrok URL as your webhook endpoint in Razorpay Dashboard → Webhooks (test mode)
```

## 2. Razorpay test-mode tooling you'll actually use

Razorpay's test mode gives you specific cards for specific outcomes — use these deliberately per scenario, don't just grab "any test card":

| Scenario | Test card / method |
|---|---|
| Successful payment | `4111 1111 1111 1111`, any future expiry, any CVV |
| Card declined | `4000 0000 0000 0002` (or use test card marked "always fails" in dashboard docs) |
| Simulate slow/pending auth | Use test UPI collect with delayed approval in the test UPI app |
| Force a webhook resend | Dashboard → Webhooks → select event → "Resend" — critical for testing your dedup logic |

**Manually trigger webhook events without a real payment** using Razorpay's webhook simulate/test tool in the dashboard, or by POSTing a synthetic payload with a valid HMAC signature computed with your test webhook secret — this is what lets you test `onAuthorized`/`onFailed`/`onRefunded` handlers without running a full checkout every time.

## 3. Test data seed script

```typescript
// test/fixtures/seed.ts
export async function seedTestMerchant() {
  const merchant = await db.merchant.create({
    data: {
      name: 'Test Merchant',
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      policy: { perTxnCapPaise: 1000000, velocityCapPerHour: 5, skuAllowlistMode: 'all' }
    }
  });
  const product = await db.product.create({
    data: { merchantId: merchant.id, title: 'Test Widget', agentPurchasable: true }
  });
  const variant = await db.productVariant.create({
    data: { productId: product.id, pricePaise: 50000 }
  });
  await db.inventory.create({ data: { variantId: variant.id, stock: 1 } }); // deliberately 1, for race tests
  return { merchant, product, variant };
}
```
Keep a `stock: 1` fixture specifically for concurrency tests, and a `stock: 100` one for normal-flow tests — don't reuse the same fixture for both, or your race-condition test will accidentally pass/fail depending on test order.

## 4. Unit tests — Money-Action Gate (pure functions, no I/O)

This is your easiest, highest-value test suite since the gate is pure logic:

```typescript
describe('runGate', () => {
  it('rejects when amount exceeds per-transaction cap', async () => {
    const ctx = buildContext({ cartTotal: 15000_00, policy: { perTxnCapPaise: 10000_00 } });
    const result = await runGate(ctx);
    expect(result.decision).toBe('REJECTED');
    expect(result.reason).toMatch(/exceeds.*limit/i);
  });

  it('rejects on amount drift between agent-stated and server-computed total', async () => {
    const ctx = buildContext({ agentStatedTotal: 500_00, serverCartTotal: 650_00 });
    const result = await runGate(ctx);
    expect(result.decision).toBe('REJECTED');
    expect(result.rule).toBe('amount_drift');
  });

  it('rejects when SKU is not agent-purchasable', async () => { /* ... */ });
  it('rejects when velocity cap breached within the hour window', async () => { /* ... */ });
  it('approves when all checks pass and returns explainable reason string', async () => {
    const result = await runGate(validCtx);
    expect(result.decision).toBe('APPROVED');
    expect(result.reason).toBeTruthy(); // never empty — this IS your explainability proof
  });
});
```

## 5. Integration tests — the stuff that actually breaks in production

**a) State hash / TOCTOU defense**
```typescript
it('rejects checkout if price changed after cart was hashed', async () => {
  const cart = await createCartWithItem(variant.id, qty: 1);
  const { stateHash } = cart;
  await db.productVariant.update({ where: { id: variant.id }, data: { pricePaise: 99999 } }); // price shifts
  const result = await initiateCheckout(cart.id, stateHash, 'idem-1');
  expect(result.error).toBe('cart_state_changed');
});
```

**b) Concurrency — last unit race**
```typescript
it('only one of two concurrent checkouts succeeds on stock of 1', async () => {
  const { variant } = await seedTestMerchant(); // stock: 1
  const cartA = await createCartWithItem(variant.id, 1);
  const cartB = await createCartWithItem(variant.id, 1);

  const [resultA, resultB] = await Promise.all([
    initiateCheckout(cartA.id, cartA.stateHash, 'idem-a'),
    initiateCheckout(cartB.id, cartB.stateHash, 'idem-b'),
  ]);

  const successes = [resultA, resultB].filter(r => r.status === 'checkout_initiated');
  expect(successes.length).toBe(1); // exactly one wins the Redis SETNX lock
});
```

**c) Idempotency — duplicate checkout request**
```typescript
it('returns the same transaction on retried idempotency key, does not double-create Razorpay order', async () => {
  const first = await initiateCheckout(cart.id, cart.stateHash, 'idem-retry-1');
  const second = await initiateCheckout(cart.id, cart.stateHash, 'idem-retry-1'); // same key
  expect(second.transactionId).toBe(first.transactionId);
  expect(razorpayCreateOrderSpy).toHaveBeenCalledTimes(1); // mock/spy on the outbound call
});
```

**d) Webhook idempotency — duplicate event**
```typescript
it('processes the same razorpay webhook event only once', async () => {
  const payload = buildAuthorizedWebhookPayload({ eventId: 'evt_dup_1' });
  await postWebhook(payload); // first delivery
  await postWebhook(payload); // Razorpay's at-least-once redelivery
  const events = await db.transactionEvent.findMany({ where: { razorpayEventId: 'evt_dup_1' } });
  expect(events.length).toBe(1);
});
```

**e) Webhook signature rejection**
```typescript
it('rejects webhook with invalid HMAC signature', async () => {
  const res = await postWebhook(payload, { signature: 'garbage' });
  expect(res.status).toBe(400);
  const events = await db.transactionEvent.count();
  expect(events).toBe(0); // nothing processed, nothing logged as accepted
});
```

**f) Outbox crash recovery**
```typescript
it('recovers a PENDING outbox entry after simulated worker crash', async () => {
  await db.outbox.create({ data: { type: 'CREATE_RAZORPAY_ORDER', status: 'PENDING', payload: {...} }});
  // simulate crash: don't run the dispatcher, just assert it's still there
  const stillPending = await db.outbox.findMany({ where: { status: 'PENDING' } });
  expect(stillPending.length).toBe(1);
  await runOutboxDispatcherOnce(); // now run it, as if the process restarted
  const done = await db.outbox.findMany({ where: { status: 'DONE' } });
  expect(done.length).toBe(1);
});
```

**g) Pre-capture gate rejection → auto-refund path**
```typescript
it('skips capture and releases lock when inventory depleted before capture', async () => {
  const txn = await getToAuthorizedState(cart); // helper: drives through gate + PSP_INITIATED
  await db.inventory.update({ where: { variantId }, data: { stock: 0 } }); // simulate external depletion
  await onAuthorizedWebhook(buildAuthorizedPayload(txn));
  const events = await db.transactionEvent.findMany({ where: { transactionId: txn.id } });
  expect(events.map(e => e.eventType)).toContain('CAPTURE_SKIPPED');
  expect(razorpayCaptureSpy).not.toHaveBeenCalled();
  const lock = await redis.get(`lock:sku:${sku}`);
  expect(lock).toBeNull(); // lock released
});
```

**h) Reconciler — the bug you just fixed**
```typescript
it('does not abandon a checkout younger than 15 minutes even if PSP status is created/null', async () => {
  const txn = await createStuckIntent({ status: 'PSP_INITIATED', ageMinutes: 3 });
  mockRazorpayOrderStatus('created'); // user still typing card
  await runReconciliationOnce();
  const updated = await db.paymentIntent.findUnique({ where: { id: txn.id } });
  expect(updated.status).toBe('PSP_INITIATED'); // untouched
  const lock = await redis.get(`lock:sku:${sku}`);
  expect(lock).not.toBeNull(); // still held
});

it('abandons and releases lock when older than 15 minutes with no PSP action', async () => {
  const txn = await createStuckIntent({ status: 'PSP_INITIATED', ageMinutes: 16 });
  mockRazorpayOrderStatus(null);
  await runReconciliationOnce();
  const updated = await db.paymentIntent.findUnique({ where: { id: txn.id } });
  expect(updated.status).toBe('ABANDONED');
});

it('replays capture logic when reconciler finds authorized status after dropped webhook', async () => {
  const txn = await createStuckIntent({ status: 'PSP_INITIATED', ageMinutes: 5 });
  mockRazorpayOrderStatus('authorized');
  await runReconciliationOnce();
  expect(razorpayCaptureSpy).toHaveBeenCalled(); // went through the same onAuthorized path
});
```

## 6. End-to-end tests (real Razorpay test mode, not mocked)

Run these against actual test-mode Razorpay, not stubs — this is what proves the integration really works, not just your mocks:

```typescript
describe('E2E: full checkout against Razorpay test mode', () => {
  it('completes a full purchase: cart → checkout → authorize → capture → fulfilled', async () => {
    const cart = await createCartWithItem(variant.id, 1);
    const { checkoutToken, razorpayOrderId } = await initiateCheckout(cart.id, cart.stateHash, uuid());
    await simulateTestPayment(razorpayOrderId, TEST_CARD_SUCCESS); // drives Razorpay's test checkout via API
    await waitForWebhookProcessed(razorpayOrderId, timeoutMs: 10000);
    const status = await getTransactionStatus(razorpayOrderId);
    expect(status.state).toBe('PSP_CAPTURED');
  }, 20000); // generous timeout, real network calls involved
});
```

## 7. Load / rate-limit tests

```typescript
it('rejects requests beyond rate limit per agent', async () => {
  const results = await Promise.all(
    Array.from({ length: 50 }).map(() => callMcpTool('search_products', { agentId: 'agent-x' }))
  );
  const rejected = results.filter(r => r.status === 429);
  expect(rejected.length).toBeGreaterThan(0);
});
```

## 8. Test file organization

```
test/
  unit/
    gate.test.ts
    stateHash.test.ts
  integration/
    checkout-concurrency.test.ts
    webhook-idempotency.test.ts
    outbox-recovery.test.ts
    reconciler.test.ts
    precapture-failure.test.ts
  e2e/
    full-checkout.e2e.test.ts
  fixtures/
    seed.ts
  helpers/
    buildContext.ts
    mockRazorpay.ts
```

## 9. Pre-submission test checklist (run this literally before recording)

- [ ] `npm test` — full unit + integration suite green
- [ ] Run concurrency test 5 times in a row (race conditions can be flaky — one clean pass isn't proof)
- [ ] Manually trigger duplicate webhook via dashboard resend → confirm only one `PSP_CAPTURED` event
- [ ] Kill the outbox worker process mid-run (real `kill -9`, not just a test mock) → restart → confirm pending entries still complete
- [ ] Run the full failure demo script (stock depletion before capture) live against test mode, not just in unit tests — this is what you're recording
- [ ] Check Razorpay dashboard directly after each test run — confirm `notes` object shows your justification strings, confirm no captured-but-unaccounted-for payments sitting in your test account
- [ ] Clear test DB/Redis and do one full clean run end-to-end, exactly as a judge replaying your demo would see it

The concurrency and idempotency tests are the ones judges will actually probe if they read your code closely — those two categories are where "we built a hackathon demo" and "we built something that survives contact with reality" visibly diverge.