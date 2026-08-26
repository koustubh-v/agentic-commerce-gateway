# Agentic Transaction & Payment Architecture

This document provides a deep dive into the high-assurance transaction and payment architecture of the Agent Commerce Gateway (ACG). It details the precise data flow, security mechanisms, and architectural patterns that guarantee safe, bounded, and explainable money movement for autonomous AI agents.

---

## 1. Glossary of Technical Patterns & Terms

- **Canonical IR (Intermediate Representation):** The normalized data model (Products, Inventory, Carts, Orders) that bridges the gap between heterogeneous merchant APIs and standardized agent protocols (ACP/MCP).
- **Money-Action Gate (The Gate):** A synchronous, deterministic policy evaluator. It acts as the final authority on whether a transaction is permitted, checking spending limits, velocity (frequency), SKU allowlists, and price drift.
- **State Hash (`CartMandate`):** A cryptographic hash (SHA-256) of a cart's contents, prices, and total. It prevents TOCTOU (Time-of-Check to Time-of-Use) attacks by binding the agent's intent to an immutable price point.
- **Two-Phase Commit (PSP Orchestration):** Interacting with the Payment Service Provider (Razorpay) using `payment_capture: 0` (manual capture). Funds are authorized first, but only captured after a final internal validation pass.
- **Outbox Pattern:** A distributed transaction technique. Instead of making risky synchronous HTTP calls to external APIs, the system writes the intent to an `Outbox` table within the same database transaction. A background worker drains this queue, ensuring exactly-once delivery and resilience against crashes.
- **Append-Only Audit Trail:** The `TransactionEvent` table logs every state transition (`GATE_APPROVED`, `PSP_AUTHORIZED`, `CAPTURE_SKIPPED`). State is event-sourced, providing an immutable history for debugging and agent explanations.
- **Fulfillment Saga:** The post-capture workflow that orchestrates notifying the merchant's backend to fulfill the order. It explicitly decouples *Payment Failure* (PSP side) from *Fulfillment Failure* (Merchant side).
- **Graceful Failure:** When an operation fails (e.g., inventory runs out between authorization and capture), the system automatically rolls back (refunds) and provides a structured, explainable reason to the agent rather than a raw exception.

---

## 2. Step-by-Step Data & Process Flow

The architecture operates in a strictly sequenced pipeline to guarantee consistency.

### Phase A: Intent & Cryptographic Bounding
1. **Cart Assembly:** The agent adds items to a cart. The system updates the PostgreSQL `Cart` model using Optimistic Concurrency Control (`version` increments).
2. **Mandate Issuance:** Upon any cart mutation, a `stateHash` is generated from the cart's line items and total. This hash is stored as a `CartMandate`.
3. **Checkout Initiation:** 
   - **HTTP Request:** The agent issues `POST /acp/checkout_sessions` (or the `initiate_checkout` MCP tool).
   - **Payload:** Contains the `cartId`, the `stateHash`, and an `idempotencyKey`.

### Phase B: Pre-PSP Validation (Gate Phase 1)
4. **Validation:** The system recomputes the `stateHash` on the server and compares it to the agent's provided hash. If prices shifted, it rejects the request.
5. **Inventory Lock:** The system issues a `SETNX` (Set if Not Exists) command to Redis to acquire a TTL-bound distributed lock on the requested SKUs.
6. **Policy Evaluation:** The transaction passes through the **Money-Action Gate**. The Gate checks:
   - Does the agent have sufficient velocity budget?
   - Is the total amount within the INR per-transaction cap?
   - Are the SKUs on the agent-purchasable allowlist?
7. **Outbox Write:** If approved, the system creates an `Order`, updates the `PaymentIntent` to `OUTBOX_WRITTEN`, and writes a `CREATE_RAZORPAY_ORDER` intent into the `Outbox` table. 
   - **Response:** The HTTP thread returns a `checkoutToken` and session details to the agent immediately.

### Phase C: Asynchronous PSP Orchestration
8. **Outbox Dispatcher:** The background `outboxWorker` (powered by BullMQ) picks up the `CREATE_RAZORPAY_ORDER` task.
9. **PSP Call:** The worker calls the Razorpay API to create an order with manual capture enabled. 
10. **State Update:** The intent is marked as `PSP_INITIATED`, and the Razorpay Order ID is recorded.

### Phase D: Payment Authorization & Verification (Gate Phase 2)
11. **User Action:** The end-user completes the payment challenge on the Razorpay checkout interface.
12. **Webhook Receipt:** Razorpay sends a server-to-server webhook.
    - **HTTP Request:** `POST /webhooks/razorpay` with payload `event: payment.authorized`.
13. **Webhook Authentication:** The gateway verifies the HMAC SHA-256 signature using the `x-razorpay-signature` header.
14. **Pre-Capture Verification:** Before taking the money, the system runs `runPreCaptureGate`. This ensures that during the time the user was entering their card details, the inventory wasn't depleted via an external merchant sync.
15. **Capture Decision:**
    - **Path A (Approved):** The gateway makes a synchronous API call to Razorpay to `capture` the funds. The state moves to `PSP_SUCCEEDED`.
    - **Path B (Rejected - Graceful Failure):** The gateway logs a `CAPTURE_SKIPPED` event (e.g., "Inventory depleted"). The funds are left uncaptured, causing Razorpay to automatically void/refund the transaction.

### Phase E: The Fulfillment Saga & Bidirectional Push
16. **Fulfillment Trigger:** Upon successful capture, the system writes a `NOTIFY_MERCHANT` task to the Outbox.
17. **Merchant Notification:** The outbox worker securely POSTs the order details to the merchant's `fulfillmentWebhookUrl`, signed with an HMAC signature.
18. **Agent Callback (Bidirectional):** Instead of making the agent poll indefinitely, the system writes a `NOTIFY_AGENT` task to the Outbox. The worker POSTs the terminal state (`PSP_SUCCEEDED` or `PSP_FAILED`) to the agent's `callbackUrl`.

---

## 3. Reconciliation & Edge Case Handling

To achieve high assurance, the system assumes network calls will fail and webhooks will be dropped.

### The Reconciliation Cron Job
- **Problem:** What if the user pays on Razorpay, but the `payment.authorized` webhook drops due to a network blip? The order would sit in `PSP_INITIATED` forever, and the user would be charged but receive nothing.
- **Solution:** A background Reconciler job polls the database every 60 seconds for intents stuck in `PSP_INITIATED` for more than 2 minutes.
- **Execution:** It queries Razorpay's API directly. If it finds the payment is actually `authorized`, it **synthesizes a webhook payload** and feeds it directly into the exact same `handlePaymentAuthorized` function used by the webhook router. This ensures the Gate rules are applied consistently, preventing bypasses.

### Idempotency
- Every mutating API call and webhook handler requires an `idempotencyKey` or relies on a unique `pspEventId`. If the same webhook is delivered twice, the database unique constraints or application-level checks will gracefully no-op the second attempt.

---

## 4. Security Measures Summary

1. **Abuse Protection:** `@fastify/rate-limit` enforces IP/Agent-level token bucket limits on all ACP and MCP routes to prevent DDoS or brute force attempts.
2. **Cryptographic Signatures:** All inbound webhooks (from Razorpay) and outbound webhooks (to Merchants/Agents) are secured via HMAC SHA-256 signatures (`x-razorpay-signature` and `X-ACG-Signature`).
3. **Data Sanitization:** The Canonical IR ensures that merchant data is stripped of malicious HTML/JS payloads before being served to LLM agents, preventing Prompt Injection attacks via product descriptions.
4. **Isolation:** Redis cart states and locks are strictly scoped using composite keys (`agentSessionId:cartId`) preventing cross-tenant leakage.
5. **No Silent Pass-Throughs:** The Money-Action Gate acts as a hard boundary. An agent cannot simply "instruct" the gateway to move money; it must successfully negotiate the cryptographic state hash and pass the deterministic gate policies.
