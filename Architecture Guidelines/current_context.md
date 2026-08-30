# Agent Commerce Gateway — Current Context

## 1. Overview and Architecture

The Agent Commerce Gateway (ACG) is a system designed to act as a bridge between arbitrary merchant backends and AI agents. It does this by normalizing merchant data into a **Canonical Intermediate Representation (IR)** and exposing that IR through standard agent protocols (MCP, ACP) via a stateless **Protocol Rendering Layer**.

At its core, ACG is a high-assurance commerce engine. It guarantees safe money movement by enforcing a **Money-Action Gate** (policy evaluator) and an **Append-Only Audit Trail** for every transaction, using a two-phase commit pattern with Razorpay.

### System Architecture
1. **Ingestion Layer:** Connects to merchants via Mode A (config mapping/polling) or Mode B (SDK/push) to ingest Products, Inventory, and Orders into the IR.
2. **Canonical Store (IR):** The hosted PostgreSQL + Redis representation of commerce concepts (`merchants`, `products`, `carts`, `orders`).
3. **Commerce Actions:** Core logic for carts and checkouts, protected by state hashes, inventory locks, and optimistic concurrency.
4. **Money-Action Gate:** A synchronous, bounded policy evaluator that intercepts any attempt to move money and ensures caps and security constraints are met.
5. **Outbox & Workers Pattern:** Distributed transaction architecture to guarantee exactly-once delivery of external PSP calls, merchant fulfillment webhooks, and agent callbacks. Includes a Reconciliation Job to catch dropped webhooks.
6. **Protocol Rendering Layer:**
   - **MCP Server:** Exposes tool calls for Claude/Anthropic ecosystem agents.
   - **ACP Router:** Exposes REST endpoints (`/feed`, `/checkout_sessions`) for OpenAI/Stripe spec agents.
7. **Payment Bridge:** Integrates with Razorpay using a two-phase commit (authorize first, verify, then capture) to handle scoped tokens securely.

---

## 2. Core Data Models (The Canonical IR)

Defined in `prisma/schema.prisma` and `src/types/ir.ts`, these models form the universal language of the gateway:

- **Merchant:** Holds credentials, API keys, Razorpay config, policy overrides, and integration configurations.
- **Product & ProductVariant:** Stores catalog data, pricing, attributes, media, and agent-purchase eligibility.
- **Inventory:** Separate from product variants to allow atomic stock updates and reservations.
- **Cart & CartItem:** Agent-facing carts featuring optimistic concurrency (`version`), TTLs, and `CartMandate` to secure cart states using cryptographic hashes (`stateHash`).
- **Order:** A snapshot of a checked-out cart, holding fulfillment status and customer information.
- **PaymentIntent:** Ties a Cart/Order to a Payment Service Provider (Razorpay) tracking amounts, idempotency keys, and checkout tokens.
- **TransactionEvent:** An immutable, event-sourced audit log. Every payment transition (e.g., `INTENT_CREATED`, `GATE_APPROVED`, `PSP_AUTHORIZED`) is recorded here.
- **Outbox:** Implements the distributed transaction pattern. System writes intents to communicate with external APIs (Razorpay, merchant backends, agent callbacks) to this table first. A background worker drains the table with exponential backoff retries, protecting against process crashes and temporary network partitions.

---

## 3. Data Flow and Commerce Mechanics

### A. Browsing and Carts
1. Agent queries products via MCP (`search_products`) or ACP (`/feed`).
2. Agent adds items to a cart. The system reserves inventory (`reserveStock`) and issues a cryptographic `stateHash` representing the cart's exact state (items, total, currency).

### B. Checkout and the Money-Action Gate
The checkout flow is heavily gated to prevent TOCTOU (Time-of-Check to Time-of-Use) attacks, unauthorized spending, and race conditions.

1. Agent calls `initiate_checkout` with the cart ID and `stateHash`.
2. **State Hash Validation:** The system recomputes the cart hash server-side to ensure prices/items haven't shifted.
3. **Inventory Lock:** The system acquires a Redis TTL lock (`acquireInventoryLock`) to prevent concurrent checkouts of the last unit.
4. **The Gate (Phase 1):** The transaction enters the `Money-Action Gate` (`runGate`). Evaluates Amount Drift, Per-Transaction Caps, Velocity Caps, and SKU Allowlists.
5. **Outbox Pattern:** If approved, an event is logged, and a `CREATE_RAZORPAY_ORDER` intent is written to the Outbox. The fastify thread responds to the agent immediately.
6. **PSP Init Worker:** The `outboxWorker` picks up the job, creates the Razorpay Order with `payment_capture: 0` (Manual Capture), and updates the system state to `PSP_INITIATED`.

### C. Razorpay Two-Phase Commit & Capture
1. The agent/user completes the payment on Razorpay.
2. Razorpay sends a `payment.authorized` webhook.
3. **The Gate (Phase 2):** Before capturing, `runPreCaptureGate` fires to ensure inventory wasn't depleted in the meantime and velocity hasn't been breached by concurrent requests.
4. If approved, the system calls Razorpay to `capture` the funds. If rejected, the capture is skipped, and Razorpay automatically refunds the user when the timeout hits (graceful failure).

### D. Fulfillment Saga & Bidirectional Callbacks
1. Upon successful capture (`PSP_SUCCEEDED`), the system initiates the Fulfillment Saga by writing a `NOTIFY_MERCHANT` task to the Outbox. This alerts the merchant backend to ship the goods.
2. The system also supports **Bidirectional notifications** for agents. If an `agentCallbackUrl` was provided at checkout initiation, the system writes a `NOTIFY_AGENT` outbox task to push the final terminal state (`PSP_SUCCEEDED` or `PSP_FAILED`) back to the agent without requiring infinite polling.

### E. Reconciliation Job
A cron job (`src/payments/reconciler.ts`) sweeps for `payment_intents` that are stuck in `PSP_INITIATED` or `UNCERTAIN` for more than 2 minutes.
It queries Razorpay directly to determine the actual state of the transaction. If it finds an 'authorized' order that the system missed (e.g., dropped webhook), the reconciler replays the state through the exact same `handlePaymentAuthorized` pipeline used by the standard webhooks, guaranteeing consistent application of Gate logic.

---

## 4. API Information

### MCP Server (`src/mcp/server.ts`)
Standard tools provided to LLM agents:
- `search_products(merchantId, query, category, maxPrice)`: Search catalog.
- `get_product_details(merchantId, productId)`: Deep dive into a product/variant.
- `create_cart(merchantId)`: Initializes a session cart.
- `add_to_cart(cartId, productId, variantId, quantity)`: Adds items, returns cart snapshot and `stateHash`.
- `initiate_checkout(cartId, stateHash, idempotencyKey)`: Runs the Gate, initiates Outbox write, returns `checkoutToken` (asynchronous PSP initialization).
- `get_transaction_status(transactionId)`: Returns current status and full audit log of a transaction.

### ACP Router (`src/acp/router.ts`)
REST endpoints designed for OpenAI/Stripe spec compatibility (Rate-limited via `@fastify/rate-limit`):
- `GET /feed?merchantId={id}`: Returns the merchant's catalog in standard feed format.
- `POST /checkout_sessions`: Accepts an array of items and an optional `agentCallbackUrl`. Internally drives the cart -> checkout flow. Returns `checkoutToken` and session details.
- `PATCH /checkout_sessions/:id`: Updates an existing checkout session prior to payment intent execution by cancelling the old session and resetting the cart items.
- `GET /checkout_sessions/:id`: Polling endpoint for agents to check if payment succeeded.
- `POST /checkout_sessions/:id/complete` & `/cancel`: Finalizes or abandons sessions gracefully.

---

## 5. Security & Consistency Summary

- **No Silenced Failures:** Every blocked action returns an explainable string mapped directly from the Gate.
- **Cryptographic Bounding:** The `stateHash` eliminates price/quantity manipulation.
- **Idempotency:** Enforced via `idempotencyKey` on the `PaymentIntent` table.
- **Event Sourcing:** `transaction_events` table ensures a complete audit trail that cannot be modified post-creation.
- **Outbox Pattern:** Protects against crashes between local DB commits and outgoing PSP HTTP calls. The worker manages exponential backoffs.
- **Rate Limiting:** All endpoints have global IP/Agent fastify rate limits as the first line of defense against DoS, while the Money-Action gate handles the deeper business-logic velocity rules.
