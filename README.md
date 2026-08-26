# Agent Commerce Gateway (ACG)

<img src="https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript" /> <img src="https://img.shields.io/badge/Node.js-20.x-green?logo=node.js" /> <img src="https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql" /> <img src="https://img.shields.io/badge/Redis-7-red?logo=redis" /> <img src="https://img.shields.io/badge/Fastify-4-black?logo=fastify" /> <img src="https://img.shields.io/badge/Prisma-5-white?logo=prisma" /> | Status: Beta

## Description

The Agent Commerce Gateway (ACG) is a high-assurance infrastructure layer designed to bridge the gap between arbitrary merchant backends and autonomous AI agents. Current agent frameworks struggle to interact with non-standardized merchant APIs securely. ACG solves this by normalizing heterogeneous commerce data into a Canonical Intermediate Representation (IR) and exposing it through standard agent protocols like MCP and ACP. By acting as a deterministic policy evaluator (the Money-Action Gate), ACG allows AI agents to securely browse catalogs and execute transactions on behalf of users. Users and merchants can trust ACG because it guarantees strict limits on transactions, prevents inventory overselling through distributed locks, and maintains an immutable audit trail using a two-phase commit pattern, ensuring safe money movement even in fully autonomous systems.

## Repository Structure

```text
.
├── assets/                    # Architecture diagrams and process flow images
├── prisma/                    # Database schema and migration files
├── src/                       # Application source code
│   ├── acp/                   # Agent Commerce Protocol router (REST)
│   ├── cache/                 # Redis client and caching logic
│   ├── commerce/              # Core transaction actions, state hashing, and locks
│   ├── db/                    # Prisma client initialization
│   ├── ingestion/             # Mode A/B merchant data synchronization logic
│   ├── ir/                    # Canonical Intermediate Representation models
│   ├── mcp/                   # Model Context Protocol stdio server
│   ├── payments/              # Money-Action Gate, Outbox, and PSP (Razorpay) logic
│   ├── webhooks/              # Inbound webhook handlers (Razorpay)
│   ├── index.ts               # Application entry point
│   └── server.ts              # Fastify server setup
├── test/                      # Automated testing suite
│   ├── e2e/                   # End-to-end checkout flow tests
│   ├── fixtures/              # Database seeding and mock data
│   ├── helpers/               # Testing context and mock builders
│   ├── integration/           # Concurrency, state hash, and webhook idempotency tests
│   └── unit/                  # Pure function tests (e.g., Gate policies)
├── docker-compose.yml         # Container definitions for DB and Redis
├── jest.config.ts             # Jest testing framework configuration
├── package.json               # Project dependencies and scripts
└── tsconfig.json              # TypeScript compiler configuration
```

## Architecture Diagrams

The architecture is divided into logical phases to enforce a rigid security perimeter around money movement.

### High-Level Translation
The gateway abstracts merchant API complexity and exposes a unified, safe interface to LLM frameworks. It acts as a bidirectional translation layer.
![ACG Translation Layer](assets/acg-translation-layer.png)

### The Money-Action Gate (Phases A & B)
During intent formation, the agent browses and builds a cart. The system reserves temporary inventory, hashes the state to prevent Time-of-Check to Time-of-Use attacks, and strictly evaluates the transaction against merchant financial limits (the Gate).
![Phase A & B: Intent & Gate Validation](assets/acg-phase-a-b.png)

### Payment Execution & Fulfillment (Phases C, D, & E)
After the gate approves, an asynchronous outbox worker handles Razorpay provisioning. Following authorization, a secondary gate check runs prior to capturing funds. Finally, bidirectional callbacks notify the merchant and update the agent seamlessly.
![Phase C, D & E: PSP Orchestration & Fulfillment](assets/acg-phase-c-d-e.png)

### Resiliency & Reconciliation
Because network conditions fluctuate, ACG assumes webhooks may drop. The reconciler sweeps for stuck payments, polls the PSP, and forces them through the unified Gate pipeline, ensuring no transaction is silently abandoned or captured without bounds checks.
![Reconciliation Architecture](assets/acg-reconciliation-architecture.png)

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

### Testing
The project includes a robust testing environment utilizing Testcontainers for complete isolation during concurrency and integration testing. 
For a complete guide on how to run tests and verify the Razorpay test-mode behaviors, refer to the [Testing Guide](test/testing_guide.md).

To run the full test suite:
```bash
npm run test
```

## License

This project is currently in the **Beta Phase** and was built exclusively for the Razorpay Buildathon. It is provided "as is" without warranty of any kind.
