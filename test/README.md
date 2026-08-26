# Testing Guide

This guide details the automated testing strategy and environment for the Agent Commerce Gateway (ACG). As an autonomous money system, testing ACG goes beyond traditional CRUD assertions. We must prove that the system behaves correctly when things happen out of order, at the wrong time, or duplicate events are fired.

---

## 1. Test Environment Setup (Testcontainers)

We use **Testcontainers** to spin up isolated PostgreSQL and Redis instances for *every* test suite run. This prevents dirty state, stale locks, and leftover carts from corrupting your concurrency and integration tests.

- **Configured in:** `test/setup.ts`
- **Execution:** Runs automatically before tests via Jest's `globalSetup`.
- **Database:** Spins up a fresh PostgreSQL container, overrides `process.env.DATABASE_URL`, and programmatically runs `npx prisma migrate deploy` to ensure schema consistency.
- **Cache:** Spins up a fresh Redis container and overrides `process.env.REDIS_URL`.

**Command:** `npm test` runs the Jest suite with ESM support natively configured in `jest.config.ts`.

---

## 2. Directory Structure

- `test/unit/`: Pure functions (e.g., `gate.test.ts`). No database or Redis required. Fast, isolated logic checks.
- `test/integration/`: Component interactions (e.g., state hash TOCTOU defense, outbox recovery, webhook deduplication). Requires the Testcontainers database.
- `test/e2e/`: Full flow tests traversing the API surface. Usually interacts with Razorpay's actual test API mode.
- `test/fixtures/`: Deterministic test data (e.g., `seed.ts` providing merchants and `stock: 1` variants for race condition tests).
- `test/helpers/`: Mocks, factories, and context builders.

---

## 3. Key Integration Testing Scenarios

When authoring new tests, ensure you cover these fundamental assertions:

### A. The "Last Unit Race" (Concurrency)
**Goal:** Prove that if `stock = 1`, and two agents attempt to checkout concurrently, only one acquires the lock.
**Methodology:** 
1. Use `seedTestMerchant` to generate a product with exactly 1 stock.
2. Create two carts with the item.
3. Call `initiateCheckout` concurrently using `Promise.all`.
4. Assert that exactly *one* request succeeds and the other receives an `InventoryLockError`.

### B. State Hash / TOCTOU Defense
**Goal:** Prove that if a merchant changes a price after an agent builds a cart, the checkout fails.
**Methodology:**
1. Create a cart and obtain the `stateHash`.
2. Directly mutate the `ProductVariant.pricePaise` in the database.
3. Attempt checkout.
4. Assert the transaction is rejected due to `cart_state_changed`.

### C. Outbox Recovery (Crash Resilience)
**Goal:** Prove that pending PSP calls are recovered if the main thread crashes.
**Methodology:**
1. Insert a `CREATE_RAZORPAY_ORDER` intent into the `Outbox` table manually with status `PENDING`.
2. Trigger the `outboxWorker` dispatcher manually.
3. Assert the entry transitions to `DONE` and the associated `PaymentIntent` reflects `PSP_INITIATED`.

### D. Reconciler Fallback
**Goal:** Prove that a dropped webhook does not trap the user.
**Methodology:**
1. Create a `PaymentIntent` stuck in `PSP_INITIATED`, artificially backdated to 5 minutes ago (`createdAt`).
2. Mock `fetchRazorpayOrderStatus` to return `authorized`.
3. Run the Reconciler explicitly.
4. Assert that the intent is properly passed through `runPreCaptureGate` and captured.
5. *Edge Case:* Create a `PSP_INITIATED` intent older than 15 minutes, mock Razorpay to return `null` or `created`, run the Reconciler, and assert it is safely marked as `FAILED` (and locks released).

---

## 4. Razorpay Test-Mode Tooling

When running E2E tests or manually verifying, use these precise Razorpay test cards:

- **Successful Payment:** `4111 1111 1111 1111` (any future expiry, any CVV)
- **Declined Card:** `4000 0000 0000 0002`

To test webhooks without completing a full checkout:
1. Use the **Razorpay Dashboard $\rightarrow$ Webhooks $\rightarrow$ Test Webhook** interface to fire synthetic payloads.
2. Alternatively, construct a payload locally, generate an HMAC SHA-256 signature using your `RAZORPAY_WEBHOOK_SECRET`, and use `curl` or `supertest` to POST it directly to `/webhooks/razorpay`.

## 5. Running Tests

- **Run all tests:** `npm run test`
- **Run Unit tests only:** `npm run test:unit`
- **Run Integration tests only:** `npm run test:integration`

Before committing or recording a demo, ensure you can run the integration tests multiple times in a row cleanly. Race condition tests are notoriously flaky if state isn't reset correctly. Testcontainers solves this by destroying the database after the suite completes.
