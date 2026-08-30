# Architecture Sequence Diagram Description

This document provides a step-by-step sequential description of the Agent Commerce Gateway (ACG) architecture. You can use this text to build a comprehensive sequence diagram (e.g., using Mermaid.js or PlantUML).

## Entities / Lifelines
To construct the diagram, define the following lifelines (left to right):
1. **User:** The end customer interacting with the AI.
2. **Merchant:** The external e-commerce backend (e.g., Shopify, Magento, custom backend).
3. **Agent:** The AI Assistant (Claude, ChatGPT) or Agent Framework.
4. **ACG Core:** The Fastify HTTP Router (ACP/MCP routes and Webhooks).
5. **ACG IR:** The Database (PostgreSQL) and Redis store.
6. **ACG Gate:** The Money-Action policy evaluator.
7. **ACG Worker:** The background BullMQ Outbox dispatcher.
8. **Razorpay:** The Payment Service Provider (PSP).

---

## 1. Phase 1: Ingestion & Setup
*Before a user ever interacts with the agent, the merchant must sync their catalog.*

1. **Merchant** $\rightarrow$ **ACG Core:** Sends product and inventory data (or ACG Core polls the Merchant via Mode A).
2. **ACG Core** $\rightarrow$ **ACG IR:** Normalizes data to Canonical IR and stores Products, Variants, and Inventory.

---

## 2. Phase 2: Browsing & Cart Assembly
*The user asks the agent to find and add an item to the cart.*

3. **User** $\rightarrow$ **Agent:** "I want to buy the latest wireless headphones."
4. **Agent** $\rightarrow$ **ACG Core:** Requests product catalog (via ACP `GET /feed` or MCP `search_products`).
5. **ACG Core** $\rightarrow$ **ACG IR:** Fetches active products.
6. **ACG IR** $\rightarrow$ **ACG Core:** Returns product list.
7. **ACG Core** $\rightarrow$ **Agent:** Returns normalized JSON catalog.
8. **Agent** $\rightarrow$ **User:** Presents options to the User.
9. **User** $\rightarrow$ **Agent:** "Add the Sony ones to my cart."
10. **Agent** $\rightarrow$ **ACG Core:** Creates cart and adds item (via MCP `add_to_cart` or ACP `POST /checkout_sessions`).
11. **ACG Core** $\rightarrow$ **ACG IR:** Reserves inventory temporarily (`reserveStock`) and updates `Cart` version.
12. **ACG Core** $\rightarrow$ **ACG Core:** Generates cryptographic `stateHash` (CartMandate) sealing the cart contents.
13. **ACG Core** $\rightarrow$ **Agent:** Returns Cart Snapshot containing the `cartId` and `stateHash`.

---

## 3. Phase 3: Checkout Initiation & Gate Phase 1
*The agent attempts to proceed to payment.*

14. **Agent** $\rightarrow$ **ACG Core:** Initiates checkout sending `cartId`, `stateHash`, and `idempotencyKey`.
15. **ACG Core** $\rightarrow$ **ACG IR:** Acquires Redis TTL Inventory Lock to prevent concurrent checkouts of the last unit.
16. **ACG Core** $\rightarrow$ **ACG Gate:** Calls `runGate(amount, currency, agentId, items)`.
17. **ACG Gate** $\rightarrow$ **ACG Core:** Evaluates rules (velocity, caps, allowlist) and returns `APPROVED`.
18. **ACG Core** $\rightarrow$ **ACG IR:** Writes `Order`, sets intent status to `OUTBOX_WRITTEN`, and creates `CREATE_RAZORPAY_ORDER` task in the Outbox table.
19. **ACG Core** $\rightarrow$ **Agent:** Synchronously returns `checkoutToken` and session details.
20. **Agent** $\rightarrow$ **User:** "Here is your secure checkout link. Please complete the payment."

---

## 4. Phase 4: Asynchronous PSP Orchestration
*The background worker safely provisions the Razorpay order.*

21. **ACG Worker** $\rightarrow$ **ACG IR:** Drains Outbox, picks up `CREATE_RAZORPAY_ORDER` task.
22. **ACG Worker** $\rightarrow$ **Razorpay:** Calls API to create order (`payment_capture: 0`).
23. **Razorpay** $\rightarrow$ **ACG Worker:** Returns `razorpayOrderId`.
24. **ACG Worker** $\rightarrow$ **ACG IR:** Updates intent status to `PSP_INITIATED`, records `razorpayOrderId`, and logs `PSP_INITIATED` event in the Audit Trail.

---

## 5. Phase 5: Payment Authorization & Gate Phase 2
*The user completes the payment challenge.*

25. **User** $\rightarrow$ **Razorpay:** Enters card details and authorizes payment.
26. **Razorpay** $\rightarrow$ **ACG Core:** Sends async webhook (`payment.authorized`).
27. **ACG Core** $\rightarrow$ **ACG Core:** Verifies HMAC SHA-256 signature.
28. **ACG Core** $\rightarrow$ **ACG Gate:** Calls `runPreCaptureGate()` to ensure locks are intact and inventory wasn't forcefully depleted.
29. **ACG Gate** $\rightarrow$ **ACG Core:** Returns `APPROVED`.
30. **ACG Core** $\rightarrow$ **Razorpay:** Makes synchronous API call to `capture` the authorized funds.
31. **Razorpay** $\rightarrow$ **ACG Core:** Acknowledges successful capture.
32. **ACG Core** $\rightarrow$ **ACG IR:** Updates intent to `PSP_SUCCEEDED`. Writes `NOTIFY_MERCHANT` and `NOTIFY_AGENT` tasks to the Outbox.

*(Note on Graceful Failure: If ACG Gate returned `REJECTED` in step 29, step 30 is skipped, the intent is marked `CAPTURE_SKIPPED`, and Razorpay auto-refunds the user).*

---

## 6. Phase 6: Fulfillment Saga & Bidirectional Push
*The system fan-outs the success state.*

33. **ACG Worker** $\rightarrow$ **ACG IR:** Drains Outbox, picks up `NOTIFY_MERCHANT` and `NOTIFY_AGENT` tasks.
34. **ACG Worker** $\rightarrow$ **Merchant:** POSTs signed webhook notifying backend to ship goods.
35. **Merchant** $\rightarrow$ **ACG Worker:** Acknowledges receipt (200 OK).
36. **ACG Worker** $\rightarrow$ **Agent:** POSTs terminal status (`PSP_SUCCEEDED`) to the Agent's callback URL.
37. **Agent** $\rightarrow$ **User:** "Payment received! Your headphones are on the way."

---

### Additional Path: Reconciliation Cron (The Safety Net)
*Runs asynchronously every 60 seconds.*

- **ACG Core (Cron)** $\rightarrow$ **ACG IR:** Queries for intents stuck in `PSP_INITIATED` > 2 minutes.
- **ACG Core (Cron)** $\rightarrow$ **Razorpay:** Polls actual order status.
- **Razorpay** $\rightarrow$ **ACG Core (Cron):** If returns `authorized`, Reconciler loops back to **Step 28** above to process it identically to a webhook.
