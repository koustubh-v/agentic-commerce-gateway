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

## Architecture Diagrams

The architecture is divided into logical phases to enforce a rigid security perimeter around money movement.

### Core Architecture
The gateway abstracts the complexity of merchant APIs and exposes a unified, safe interface to LLM frameworks.
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
For a complete guide on how to run tests and verify the Razorpay test behaviors, refer to the [Testing Guide](test/testing_guide.md).

To run the full test suite:
```bash
npm run test
```

## License

This project is currently in the **Beta Phase** and was built exclusively for the Razorpay Buildathon. It is provided "as is" without warranty of any kind.
