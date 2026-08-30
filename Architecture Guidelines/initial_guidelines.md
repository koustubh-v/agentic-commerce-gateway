## 1. The core idea: don't pick one protocol, build a canonical IR

Build a **canonical intermediate representation (IR)** of commerce concepts, and let your layer render that IR into whatever protocol the calling agent speaks. 

**IR entities you need:**
- `Merchant` — identity, currency, tax mode, fulfillment regions
- `Product` — id, title, description, price, currency, images, variants, availability, category
- `Inventory` — stock count/status per variant
- `Cart` — line items, totals, applied discounts
- `Order` — cart snapshot + status + fulfillment state
- `PaymentIntent` — scoped token, amount, merchant reference, PSP reference (Razorpay order ID)

Every merchant integration's job is just to **populate this IR**. Every consuming agent's job is just to **read this IR** through whatever protocol it understands. This decoupling is the entire architecture.

## 2. System components

```
Merchant Backend (arbitrary)
        │
        │  (10-15 line SDK snippet)
        ▼
┌─────────────────────────┐
│   Ingestion Adapter      │  ← normalizes merchant data → IR
│   (SDK or config-mapper) │
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│   Canonical Store        │  ← your hosted IR (Postgres/Redis cache)
│   (products, cart, order)│
└─────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│           Protocol Rendering Layer            │
│  ┌───────────┐ ┌───────────┐ ┌─────────────┐ │
│  │ MCP Server │ │ ACP REST   │ │ schema.org/ │ │
│  │ (tools)    │ │ endpoints  │ │ llms.txt    │ │
│  └───────────┘ └───────────┘ └─────────────┘ │
└─────────────────────────────────────────────┘
        │
        ▼
   Discovery layer (.well-known, llms.txt, sitemap-for-agents)
        │
        ▼
   Payment bridge (Razorpay scoped-token checkout)
```

## 3. Ingestion Adapter — the "10-15 lines" part

This is the make-or-break UX decision. Two integration modes, both landing at ≤15 lines:

**Mode A — Config-mapping (zero code, for REST-backed merchants)**
Merchant gives you their existing endpoints + a JSON path mapping. No code at all, just a manifest:
```json
{
  "products_endpoint": "https://merchant.com/api/products",
  "field_map": { "id": "$.sku", "title": "$.name", "price": "$.price_inr", "stock": "$.qty" },
  "checkout_webhook": "https://merchant.com/api/order/create",
  "razorpay_key_id": "rzp_live_xxx"
}
```
Your service polls/webhooks against their existing API and maps it into IR. Zero code changes on their side — just a form/API call to *your* onboarding endpoint.

**Mode B — SDK snippet (for merchants who want push-based sync or have no API at all)**
```python
from aireadify import Agentify

az = Agentify(api_key="ak_xxx", currency="INR")

@az.products
def list_products():
    return db.query("SELECT * FROM products")

@az.checkout
def create_order(cart):
    return razorpay_client.order.create(cart.total, cart.currency)

az.serve()  # spins up MCP + ACP + discovery endpoints as a mounted route
```
That's ~10 lines. `az.serve()` mounts `/mcp`, `/.well-known/ai-plugin.json`, `/acp/*` on their existing app (Flask/Express/FastAPI blueprint) or runs as a sidecar if they don't want it in-process at all.

**Design decision:** support both because merchant maturity varies wildly — a WordPress/WooCommerce shop can't add Python code, but a startup with a real backend can. Mode A covers the "don't even want to touch code" segment; Mode B covers "give me control."

## 4. Protocol Rendering Layer (this is where versatility lives)

Each renderer is a pure function `IR → Protocol Format`. Build these as independent, addable modules so new protocols (UCP, whatever comes next) plug in without touching ingestion:

- **MCP Server renderer** — exposes tools: `search_products`, `get_product_details`, `add_to_cart`, `create_checkout_session`, `get_order_status`. This is what Claude/Anthropic-ecosystem agents call directly.
- **ACP renderer** — exposes the `/feed`, `/checkout_sessions` REST endpoints per the OpenAI/Stripe spec so ChatGPT-style agents can transact. The feed pushes a compressed product file with title, description, price, availability, and images, while five checkout REST endpoints handle session creation, updates, state, completion, and cancellation.
- **schema.org/JSON-LD + llms.txt renderer** — for agents with no tool-calling at all (pure text-browsing LLMs), inject structured `Product`/`Offer` JSON-LD into pages and generate an `llms.txt` summary. This is your fallback tier — lowest capability, widest compatibility.
- **UCP renderer (stretch)** — Google's coalition protocol for AI Mode/Gemini surfaces, worth a stub even if not fully built for the hackathon, since judges will know it exists.

Keep each renderer stateless and driven only by IR — that's what lets you say "one integration, every surface."

## 5. Payment bridge (this is your Razorpay-specific edge)

Model this exactly like ACP's delegated-token pattern rather than inventing your own:
- Agent requests checkout → your layer creates a Razorpay Order scoped to cart total + merchant account
- Return a **scoped payment token/session**, not raw card data, to the agent
- Agent (or the human via agent-initiated deep link) completes payment through Razorpay Checkout
- Webhook from Razorpay → your layer → updates Order status in IR → merchant's `create_order` fulfillment hook fires
- Merchant stays merchant-of-record the whole time — you're a pass-through orchestrator, never touching funds

This is important to state explicitly in your architecture doc: **you never custody money**, you only orchestrate token-scoped delegation. That's both a compliance simplification and matches exactly how ACP works. Scoped payment tokens are tied to a specific merchant and cart total, and the merchant processes the transaction through its own payment provider while handling fulfillment and returns as it normally would.

## 6. Discovery layer

Agents need to *find* that a site is AI-ready before they call anything:
- `/.well-known/ai-plugin.json` — capability manifest (what tools/endpoints exist)
- `/llms.txt` — plain-text summary for non-tool LLMs
- `<script type="application/ld+json">` injected via the SDK's `serve()` call, or via a snippet if it's a static site
- Optionally register into a central directory your platform maintains, so agents/aggregators can discover *all* onboarded merchants in one place — this is your growth lever, separate from the per-merchant technical layer

## 7. Sync & freshness engine

Non-negotiable for a commerce use case — stale prices/stock will break trust immediately.
- Mode B (SDK): sync is push-based and always live, since your functions call their DB/API directly on each request
- Mode A (config-mapping): need a poll interval (e.g., every 2–5 min) + webhook option if the merchant can fire one on stock/price change + a `stale-after` TTL so agents get an "unconfirmed, verify at checkout" flag if data is older than N minutes
- Cache layer (Redis) in front of IR reads so agent traffic doesn't hammer merchant backends directly

## 8. Auth/security model

- Merchant ↔ your platform: API key, scoped per merchant, rotate-able
- Agent ↔ your platform: OAuth2 client-credentials or ACP-style delegated auth token, scoped to read-catalog / create-checkout only — never raw merchant admin access
- Rate limiting per agent-key to prevent scraping abuse of the catalog endpoints
- Signed webhooks both directions (Razorpay → you, you → merchant) with HMAC verification

## 9. Why this plan is versatile, concretely

- Any merchant backend shape → Mode A or Mode B covers "has an API" vs "doesn't"
- Any agent capability level → MCP for tool-callers, ACP for ChatGPT-style checkout, JSON-LD/llms.txt for plain LLMs
- Any PSP → Razorpay is your default rail for the hackathon, but the IR's `PaymentIntent` is PSP-agnostic, so Stripe/PayU could be added later as another renderer without touching ingestion
- Any future protocol → new renderer, zero change to how merchants integrate

This is the piece to build first and demo tightly: **one merchant, one config file, one working MCP tool call that returns real product data and completes a real Razorpay-backed checkout.** That's the whole "10-15 lines → AI-ready" story in a single demoable slice.