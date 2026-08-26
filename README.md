# Agent Commerce Gateway (ACG)

The **Agent Commerce Gateway (ACG)** is a high-assurance infrastructure layer designed to bridge the gap between arbitrary merchant backends and autonomous AI agents. By normalizing heterogeneous commerce data into a **Canonical Intermediate Representation (IR)** and exposing it through standard agent protocols (MCP, ACP), ACG allows AI agents to securely browse catalogs and execute transactions on behalf of users.

At its core, ACG acts as a deterministic policy evaluator (the **Money-Action Gate**), ensuring safe money movement, preventing race conditions, and maintaining an immutable audit trail using a two-phase commit pattern.

---

## 1. High-Level Architecture

The gateway abstracts the complexity of merchant APIs (Shopify, Magento, Custom) and exposes a unified, safe interface to LLM frameworks.

![ACG High Level Architecture](assets/acg-architecture.png)
<br/>
![ACG Translation Layer](assets/acg-translation-layer.png)

### Key Components:
- **Canonical Store (IR):** The centralized PostgreSQL + Redis representation of commerce objects (Products, Inventory, Carts, Orders).
- **Protocol Rendering Layer:**
  - **MCP Server:** Exposes explicit tool calls (`search_products`, `initiate_checkout`) for Claude/Anthropic ecosystem agents.
  - **ACP Router:** Exposes REST endpoints (`/feed`, `/checkout_sessions`) designed for OpenAI/Stripe spec compatibility.
- **Money-Action Gate:** A synchronous policy evaluator enforcing velocity caps, per-transaction limits, and SKU allowlists *before* any money moves.

---

## 2. Full Process Flow

The lifecycle of an agentic transaction requires strict sequencing to avoid Time-of-Check to Time-of-Use (TOCTOU) attacks and inventory overselling.

![ACG Process Flow](assets/acg-process-flow.jpeg)

---

## 3. Transaction Mechanics (Phases A & B)

This phase covers intent formation and the initial cryptographic bounding.

![Phase A & B: Intent & Gate Validation](assets/acg-phase-a-b.png)

1. **Browsing & Cart Assembly:** The agent queries products and builds a cart. The system reserves temporary inventory and generates a `stateHash` (CartMandate) sealing the cart's exact state.
2. **Checkout Initiation:** The agent submits the `cartId` and `stateHash`.
3. **Money-Action Gate (Phase 1):** The system recomputes the hash to ensure prices haven't shifted. It acquires a distributed Redis lock to prevent concurrent checkouts of the last item. The transaction is then evaluated against the merchant's financial limits and velocity policies.
4. **Outbox Write:** If approved, a `CREATE_RAZORPAY_ORDER` intent is written to the Outbox table.

---

## 4. Payment Execution & Fulfillment (Phases C, D, & E)

This phase covers asynchronous orchestration with the PSP (Razorpay) and bidirectional notification.

![Phase C, D & E: PSP Orchestration & Fulfillment](assets/acg-phase-c-d-e.png)

1. **Asynchronous PSP Init (Phase C):** The background `outboxWorker` safely provisions the Razorpay order (`payment_capture: 0`).
2. **Authorization & Gate Phase 2 (Phase D):** After the user authorizes payment, Razorpay fires a webhook. The system runs `runPreCaptureGate` to ensure locks are intact before synchronously capturing the funds.
3. **Graceful Failure:** If the Gate rejects the capture (e.g., inventory depleted forcefully), the funds are left uncaptured and automatically refunded.
4. **Fulfillment Saga & Callbacks (Phase E):** Upon successful capture, the system writes `NOTIFY_MERCHANT` and `NOTIFY_AGENT` tasks to the Outbox. This alerts the backend to ship the goods and actively pushes the terminal success state to the AI agent, eliminating the need for indefinite polling.

---

## 5. Resiliency & Reconciliation

Because network requests drop and servers crash, ACG assumes external webhooks are unreliable.

![Reconciliation Architecture](assets/acg-reconciliation-architecture.png)

- **Outbox Pattern:** Protects against crashes between local DB commits and outgoing PSP/webhook HTTP calls by queueing intents with exponential backoff retries.
- **Reconciliation Cron Job:** Sweeps for `PaymentIntents` stuck in `PSP_INITIATED` or `UNCERTAIN` for more than 2 minutes (while ignoring active checkouts < 15 minutes old).
- **Unified Logic Path:** The Reconciler polls Razorpay directly. If it discovers a missed `authorized` payment, it synthesizes an event payload and feeds it into the exact same webhook handler pipeline, guaranteeing the Money-Action Gate rules are applied consistently.

---

## 6. Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL
- Redis
- Razorpay Sandbox Account

### Setup
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Copy the `.env.example` file to `.env` and fill in your database, Redis, and Razorpay credentials.
3. Apply database migrations:
   ```bash
   npx prisma migrate dev
   ```
4. Start the gateway:
   ```bash
   npm run dev
   ```
The HTTP router (ACP/Webhooks) runs on port 3000, and the MCP stdio server handles agent tool calls locally.
