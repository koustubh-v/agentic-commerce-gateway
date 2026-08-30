# Agent Commerce Gateway (ACG)

<img src="https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript" /> <img src="https://img.shields.io/badge/Node.js-20.x-green?logo=node.js" /> <img src="https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql" /> <img src="https://img.shields.io/badge/Redis-7-red?logo=redis" /> <img src="https://img.shields.io/badge/Fastify-4-black?logo=fastify" /> <img src="https://img.shields.io/badge/Prisma-5-white?logo=prisma" /> <img src="https://img.shields.io/badge/Status-Beta-orange" />

The Agent Commerce Gateway is a secure infrastructure layer built to bridge the gap between merchant backends and autonomous AI agents. Right now, most agent frameworks struggle to interact with various merchant APIs safely. We solve this by normalizing different commerce data into a single standard format. By acting as a strict rule evaluator before any money moves, we allow AI agents to safely browse catalogs and complete transactions for users. Everyone can trust this gateway because it guarantees strict limits on transactions, prevents selling items that are out of stock through distributed locks, and keeps a permanent log of all actions. This ensures safe money movement even in fully autonomous systems.

## Repository Structure

```text
.
├── assets/                    # Architecture diagrams and process flow images
├── dashboard/                 # Next.js Merchant & Admin Frontend
│   ├── public/                # Static assets (images, videos)
│   └── src/                   # React components, pages, and NextAuth APIs
├── prisma/                    # Database schema and migration files
├── src/                       # Application source code (Backend)
│   ├── acp/                   # Agent Commerce Protocol router (REST)
│   ├── cache/                 # Redis client and caching logic
│   ├── commerce/              # Core transaction actions, state hashing, and locks
│   ├── db/                    # Prisma client initialization
│   ├── ingestion/             # Mode A/B merchant data synchronization logic
│   ├── ir/                    # Canonical Intermediate Representation models
│   ├── mcp/                   # Model Context Protocol stdio server
│   ├── payments/              # Money Gate, Outbox, and PSP logic
│   ├── webhooks/              # Inbound webhook handlers
│   ├── index.ts               # Application entry point
│   └── server.ts              # Fastify server setup
├── scripts/
│   └── demo/                  # Demo scripts (delete after recording)
│       ├── demo-ingest.ts     # Seeds a merchant + products into the database
│       └── demo-agent.ts      # Simulates an AI agent completing a purchase
├── test/                      # Automated testing suite
│   ├── e2e/                   # End to end checkout flow tests
│   ├── fixtures/              # Database seeding and mock data
│   ├── helpers/               # Testing context and mock builders
│   ├── integration/           # Concurrency, state hash, and webhook tests
│   └── unit/                  # Pure function tests
├── docker-compose.yml         # Container definitions for DB and Redis
├── jest.config.ts             # Jest testing framework configuration
├── package.json               # Project dependencies and scripts
└── tsconfig.json              # TypeScript compiler configuration
```

## Architecture

### Core Architecture

The gateway enforces a rigid security perimeter around every agentic transaction. The diagram below shows the full data flow from an AI agent through the policy gate to the payment provider.

![ACG High Level Architecture](assets/acg-architecture.png)
<p align="center"><em>Fig 1: Main ACG Architecture</em></p>

### Process Flow

The lifecycle of an agentic transaction requires strict sequencing to avoid attacks and inventory overselling.

![ACG Process Flow](assets/acg-process-flow.jpeg)
<p align="center"><em>Fig 2: Overall Process Flow</em></p>

### High Level Translation

The gateway acts as a bidirectional translation layer between merchant APIs and the agents.

![ACG Translation Layer](assets/acg-translation-layer.png)
<p align="center"><em>Fig 3: Translation Layer</em></p>

### The Money Gate (Phases A & B)

During intent formation, the agent browses and builds a cart. The system reserves temporary inventory, hashes the state to prevent tampering, and strictly evaluates the transaction against merchant financial limits.

![Phase A & B: Intent & Gate Validation](assets/acg-phase-a-b.png)
<p align="center"><em>Fig 4.1: Phase A & B Intent & Gate Validation</em></p>

### Payment Execution & Fulfillment (Phases C, D, & E)

After the gate approves, an asynchronous outbox worker handles payment provisioning. Following authorization, a secondary gate check runs prior to capturing funds. Finally, bidirectional callbacks notify the merchant and update the agent seamlessly.

![Phase C, D & E: PSP Orchestration & Fulfillment](assets/acg-phase-c-d-e.png)
<p align="center"><em>Fig 4.2: Phase C, D & E Payment Execution & Fulfillment</em></p>

### Resiliency & Reconciliation

Because network conditions fluctuate, we assume webhooks may drop. The reconciler sweeps for stuck payments, polls the PSP, and forces them through the unified Gate pipeline, ensuring no transaction is silently abandoned or captured without bounds checks.

![Reconciliation Architecture](assets/acg-reconciliation-architecture.png)
<p align="center"><em>Fig 5: Resiliency & Reconciliation Architecture</em></p>

---

## Getting Started

Follow these steps to set up the environment and run the gateway locally.

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the environment variables:
   ```bash
   cp .env.example .env
   ```
   Fill in your PostgreSQL, Redis, and Razorpay test credentials.

3. Start PostgreSQL and Redis (via Docker):
   ```bash
   docker-compose up -d
   ```

4. Apply database migrations:
   ```bash
   npx prisma migrate dev
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

---

## Demo Script

The `scripts/demo/` folder contains two scripts that simulate the full agentic commerce flow end-to-end. They are intended for demo recordings and can be deleted afterwards.

### Step 1 — Seed the database

This creates a test merchant and a product catalog in the database.

```bash
npx ts-node --esm scripts/demo/demo-ingest.ts
```

What it does:
- Creates a `Demo Merchant` record with spend and category policies
- Injects sample products (e.g. a laptop, headphones) into the catalog
- Prints the merchant ID for reference

### Step 2 — Run the AI agent

This script simulates an AI agent autonomously completing a purchase through ACG.

```bash
npx ts-node --esm scripts/demo/demo-agent.ts
```

What it does:
1. Registers itself as a new `AgentClient` (OAuth client credentials)
2. Calls `POST /acp/oauth/token` to obtain a Bearer token
3. Finds the first available product from the catalog
4. Calls `POST /acp/checkout_sessions` to initiate checkout through the policy gate
5. On **gate approval**: prints the Razorpay Order ID and a human-in-the-loop checkout URL
6. On **gate rejection**: prints the blocking rule — visible instantly in the Merchant Dashboard audit log

### Expected output (approved)

```
[AI AGENT] Waking up...
Authenticating with ACG as "Demo Shopping Agent"...
Access token acquired.

Found product: Sony WH-1000XM5 - ₹24999
Attempting to purchase via Agent Commerce Gateway...

======================================================
GATEWAY APPROVED
======================================================
Razorpay provisioning successful.
Gateway Order ID: <uuid>

Human-in-the-loop Checkout Link:
http://localhost:3000/checkout/<token>
======================================================

Demo tip: Open the link above to complete the Razorpay payment, then check your Merchant Dashboard!
```

### Expected output (blocked)

```
======================================================
GATEWAY BLOCKED TRANSACTION
======================================================
Reason: Spend limit exceeded
Rule Enforced: MAX_SPEND
======================================================

Demo tip: Check your Merchant Dashboard Audit logs. The block was recorded instantly.
```

---

## MCP Server (Model Context Protocol)

ACG exposes a native MCP server over **Server-Sent Events (SSE)**. This allows Claude Desktop, Cursor, and any MCP-compatible agent host to connect and use ACG tools directly without writing REST calls.

### Transport

| Endpoint | Method | Description |
|---|---|---|
| `/mcp/sse` | `GET` | Establishes the SSE connection. Keep this open. |
| `/mcp/message` | `POST` | Sends tool calls from the agent host to ACG. |

### Connecting Claude Desktop

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agent-commerce-gateway": {
      "url": "http://localhost:3000/mcp/sse",
      "transport": "sse"
    }
  }
}
```

### Connecting Cursor

In Cursor settings → MCP → Add server:

```json
{
  "name": "ACG",
  "url": "http://localhost:3000/mcp/sse"
}
```

### Available MCP Tools

| Tool | Required args | Description |
|---|---|---|
| `search_products` | `merchantId` | Search products by query, category, or max price |
| `get_product_details` | `merchantId`, `productId` | Full product details including variants and inventory |
| `create_cart` | `merchantId` | Start a new agent shopping session |
| `add_to_cart` | `cartId`, `productId` | Add an item; returns `state_hash` for tamper-proof checkout |
| `initiate_checkout` | `cartId`, `stateHash` | Pass the gate, create Razorpay order, return checkout token |
| `get_transaction_status` | `transactionId` | Full audit trail for any transaction |

### Example MCP tool call sequence

```
1. search_products(merchantId: "mrch_xxx", query: "laptop")
2. create_cart(merchantId: "mrch_xxx")
3. add_to_cart(cartId: "cart_yyy", productId: "prod_zzz", quantity: 1)
   → returns { state_hash: "sha256_abc..." }
4. initiate_checkout(cartId: "cart_yyy", stateHash: "sha256_abc...")
   → returns { checkoutToken, razorpayOrderId, gateDecision: "APPROVED" }
5. get_transaction_status(transactionId: "<checkoutSessionId>")
```

---

## REST API Reference

All endpoints are prefixed with `/acp`. The server runs on port `3000` by default.

### Authentication

ACG uses **OAuth 2.0 Client Credentials** flow. Every agent must first obtain a Bearer token.

---

#### `POST /acp/oauth/token`

Exchange client credentials for a short-lived Bearer token (1 hour TTL).

**Request body**

```json
{
  "grant_type": "client_credentials",
  "client_id": "agent_abc123",
  "client_secret": "your_secret"
}
```

**Response `200`**

```json
{
  "access_token": "eyJhbGci...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Error responses**

| Status | Error | Cause |
|---|---|---|
| `400` | `unsupported_grant_type` | Only `client_credentials` is supported |
| `401` | `invalid_client` | Wrong credentials or revoked client |

---

#### `GET /acp/feed`

Returns the agent-purchasable product catalog for a merchant in normalized IR format.

**Required scope:** `catalog:read`

**Query parameters**

| Param | Type | Required | Description |
|---|---|---|---|
| `merchantId` | string | yes | The merchant whose catalog to fetch |

**Response `200`**

```json
{
  "feed": [
    {
      "id": "prod_xxx",
      "title": "Sony WH-1000XM5",
      "description": "...",
      "price": 24999,
      "currency": "INR",
      "availability": "IN_STOCK",
      "variants": [
        { "id": "var_yyy", "title": "Black", "price": 24999 }
      ]
    }
  ]
}
```

---

#### `POST /acp/checkout_sessions`

Creates a cart, adds items, runs the policy gate, and provisions a Razorpay order — all in a single atomic call.

**Required scope:** `checkout:write`

**Rate limit:** 50 requests per agent per hour.

**Request body**

```json
{
  "merchantId": "mrch_xxx",
  "items": [
    { "productId": "prod_yyy", "variantId": "var_zzz", "quantity": 1 }
  ],
  "agentCallbackUrl": "https://your-agent.example.com/webhook"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `merchantId` | string | yes | Target merchant |
| `items` | array | yes | At least one item required |
| `items[].productId` | string | yes | Product to purchase |
| `items[].variantId` | string | no | Specific variant |
| `items[].quantity` | number | yes | Must be ≥ 1 |
| `agentCallbackUrl` | string | no | URL ACG will POST fulfilment events to |

**Response `200` — Gate approved**

```json
{
  "checkoutSessionId": "ord_uuid",
  "checkoutToken": "tok_abc123",
  "razorpayOrderId": "order_Rzp...",
  "razorpayKeyId": "rzp_test_...",
  "amount": 24999,
  "currency": "INR",
  "gateDecision": "APPROVED"
}
```

**Error responses**

| Status | Error | Cause |
|---|---|---|
| `400` | validation error | Missing `merchantId` or empty `items` |
| `403` | `gate_rejected` | Policy rule blocked the transaction (includes `rule` field) |
| `409` | `cart_state_changed` | Cart was modified after state hash was computed |
| `409` | `inventory_locked` | Another session holds the inventory lock |
| `500` | server error | Unexpected failure |

**Gate rejection example**

```json
{
  "error": "Spend limit exceeded for this agent",
  "rule": "MAX_SPEND"
}
```

---

#### `GET /acp/checkout_sessions/:id`

Returns the current status and full audit trail for a checkout session.

**Required scope:** `checkout:read`

**Path parameters**

| Param | Description |
|---|---|
| `id` | The `checkoutSessionId` from the create response |

**Response `200`**

```json
{
  "orderId": "ord_uuid",
  "status": "PAYMENT_CAPTURED",
  "amount": 24999,
  "currency": "INR",
  "gateDecision": "APPROVED",
  "auditTrail": [
    { "event": "GATE_APPROVED", "timestamp": "2024-01-01T10:00:00Z" },
    { "event": "RAZORPAY_ORDER_CREATED", "timestamp": "2024-01-01T10:00:01Z" },
    { "event": "PAYMENT_CAPTURED", "timestamp": "2024-01-01T10:05:00Z" }
  ]
}
```

---

#### `PATCH /acp/checkout_sessions/:id`

Update the items in an existing checkout session before it is paid.

**Required scope:** `checkout:write`

**Request body**

```json
{
  "items": [
    { "productId": "prod_yyy", "variantId": "var_zzz", "quantity": 2 }
  ]
}
```

**Response `200`**

```json
{
  "status": "updated",
  "cart": { "id": "cart_xxx", "items": [...] }
}
```

---

#### `POST /acp/checkout_sessions/:id/complete`

Marks a session as complete and returns its final status. Idempotent.

**Required scope:** `checkout:write`

**Response `200`** — Same shape as `GET /acp/checkout_sessions/:id`.

---

#### `POST /acp/checkout_sessions/:id/cancel`

Cancels a pending checkout session and releases any inventory locks.

**Required scope:** `checkout:write`

**Response `200`**

```json
{ "status": "cancelled" }
```

---

### Testing

The project includes a robust testing environment utilizing Testcontainers for complete isolation during concurrency and integration testing.
For a complete guide on how to run tests and verify the Razorpay test behaviors, refer to the [Testing Guide](test/testing_guide.md).

To run the full test suite:
```bash
npm run test
```

---

## License

This project is currently in the **Beta Phase** and was built exclusively for the Razorpay Buildathon. It is provided "as is" without warranty of any kind.
