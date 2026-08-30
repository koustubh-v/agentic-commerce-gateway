# Phase 1: Production Ingestion Engine (Mode A)

The hackathon version was "poll and upsert." Production needs per-merchant isolation, failure containment, and observability — one broken merchant API should never affect another merchant's sync.

## 1.1 Schema additions

```prisma
model MerchantSyncConfig {
  id                String   @id @default(uuid())
  merchantId        String
  productsEndpoint  String
  authType          String   // 'none' | 'api_key_header' | 'basic' | 'oauth2'
  authConfigEncrypted String // encrypted blob: header name, key, or oauth token endpoint
  fieldMap          Json     // { title: "$.name", price: "$.cost", stock: "$.qty", ... }
  pollIntervalMs    Int      @default(300000)
  paginationConfig  Json?    // { type: 'cursor'|'page', param: 'page', maxPages: 20 }
  active            Boolean  @default(true)
  circuitState      String   @default("CLOSED") // CLOSED | OPEN | HALF_OPEN
  consecutiveFailures Int    @default(0)
  lastSuccessAt     DateTime?
}

model SyncRun {
  id            String   @id @default(uuid())
  configId      String
  startedAt     DateTime @default(now())
  finishedAt    DateTime?
  status        String   // RUNNING | SUCCESS | PARTIAL | FAILED
  itemsFetched  Int      @default(0)
  itemsUpserted Int      @default(0)
  itemsFailed   Int      @default(0)
  errorSummary  Json?
}
```

`SyncRun` is what makes this debuggable in production — when a merchant asks "why isn't my new product showing up," you query this table instead of grepping logs.

## 1.2 The worker — BullMQ, not setInterval

`setInterval` doesn't survive process restarts cleanly and gives you no retry/backoff for free. Use BullMQ with a repeatable job per merchant config:

```typescript
// src/ingestion/adapters/modeA/scheduler.ts
import { Queue } from 'bullmq';

const syncQueue = new Queue('merchant-sync', { connection: redisConnection });

export async function scheduleAllActiveSyncs() {
  const configs = await db.merchantSyncConfig.findMany({ where: { active: true } });
  for (const config of configs) {
    await syncQueue.add(
      `sync-${config.id}`,
      { configId: config.id },
      { repeat: { every: config.pollIntervalMs }, jobId: `sync-${config.id}` }
    );
  }
}
```

```typescript
// src/ingestion/adapters/modeA/worker.ts
import { Worker } from 'bullmq';
import { JSONPath } from 'jsonpath-plus';

new Worker('merchant-sync', async (job) => {
  const config = await db.merchantSyncConfig.findUnique({ where: { id: job.data.configId } });
  if (config.circuitState === 'OPEN') {
    if (Date.now() - config.lastFailureAt < CIRCUIT_COOLDOWN_MS) return; // skip, still cooling down
    await db.merchantSyncConfig.update({ where: { id: config.id }, data: { circuitState: 'HALF_OPEN' } });
  }

  const run = await db.syncRun.create({ data: { configId: config.id, status: 'RUNNING' } });

  try {
    const authHeaders = await buildAuthHeaders(config); // decrypt + build per authType
    const rawItems = await fetchAllPages(config, authHeaders); // handles pagination
    let upserted = 0, failed = 0;

    for (const raw of rawItems) {
      try {
        const mapped = mapItemToIR(raw, config.fieldMap);
        validateMappedProduct(mapped); // throws on missing required fields
        await upsertProductAndInventory(config.merchantId, mapped);
        upserted++;
      } catch (err) {
        failed++;
        await logMalformedItem(run.id, raw, err); // dead-letter, don't kill the whole run
      }
    }

    await db.syncRun.update({
      where: { id: run.id },
      data: { status: failed > 0 ? 'PARTIAL' : 'SUCCESS', finishedAt: new Date(),
               itemsFetched: rawItems.length, itemsUpserted: upserted, itemsFailed: failed }
    });
    await db.merchantSyncConfig.update({
      where: { id: config.id },
      data: { circuitState: 'CLOSED', consecutiveFailures: 0, lastSuccessAt: new Date() }
    });
  } catch (err) {
    // total failure — merchant API down, auth broken, etc.
    const failures = config.consecutiveFailures + 1;
    await db.merchantSyncConfig.update({
      where: { id: config.id },
      data: { consecutiveFailures: failures, circuitState: failures >= 3 ? 'OPEN' : config.circuitState,
               lastFailureAt: new Date() }
    });
    await db.syncRun.update({ where: { id: run.id }, data: { status: 'FAILED', errorSummary: { message: err.message } } });
    if (failures >= 3) await notifyMerchantSyncBroken(config.merchantId, err);
  }
}, { connection: redisConnection, concurrency: 5 });
```

**Why the circuit breaker matters in production:** without it, one merchant's dead API gets hammered every `pollIntervalMs` forever, burning your infra and possibly triggering their rate limits or abuse alerts. `OPEN` state backs off; `HALF_OPEN` tries once to see if it recovered.

## 1.3 Diffing to avoid write amplification

Don't blindly upsert every item every cycle — hash the mapped payload and skip the write if unchanged:

```typescript
async function upsertProductAndInventory(merchantId, mapped) {
  const contentHash = sha256(JSON.stringify(mapped));
  const existing = await db.product.findUnique({ where: { externalId: mapped.externalId } });
  if (existing?.contentHash === contentHash) return; // no-op, saves a DB write

  await db.product.upsert({
    where: { externalId: mapped.externalId },
    create: { merchantId, ...mapped, contentHash },
    update: { ...mapped, contentHash },
  });
}
```
This also gives you a clean signal for the dashboard: "N products updated, M unchanged" per sync run.

## 1.4 Auth types to support (production merchants have all of these)

```typescript
async function buildAuthHeaders(config: MerchantSyncConfig) {
  const auth = decrypt(config.authConfigEncrypted); // AES-256-GCM, key from KMS/env
  switch (config.authType) {
    case 'api_key_header': return { [auth.headerName]: auth.value };
    case 'basic': return { Authorization: `Basic ${Buffer.from(`${auth.user}:${auth.pass}`).toString('base64')}` };
    case 'oauth2': return { Authorization: `Bearer ${await getOrRefreshOAuthToken(config, auth)}` };
    default: return {};
  }
}
```
Encrypt `authConfigEncrypted` at rest — this is literally other companies' API credentials sitting in your DB. Non-negotiable for anything you'd call production.

---

# Phase 2: Production Fulfillment Dispatcher

Same Outbox pattern you already trust, extended with delivery observability and a circuit breaker mirroring the ingestion side.

```prisma
model WebhookDelivery {
  id            String   @id @default(uuid())
  outboxId      String
  merchantId    String
  url           String
  attempt       Int      @default(1)
  statusCode    Int?
  responseBody  String?
  succeeded     Boolean  @default(false)
  attemptedAt   DateTime @default(now())
}
```

```typescript
// src/workers/fulfillmentDispatcher.ts
new Worker('fulfillment-dispatch', async (job) => {
  const entry = await db.outbox.findUnique({ where: { id: job.data.outboxId } });
  const merchant = await db.merchant.findUnique({ where: { id: entry.merchantId } });
  const signature = hmacSha256(JSON.stringify(entry.payload), merchant.webhookSigningSecret);

  try {
    const res = await axios.post(merchant.fulfillmentWebhookUrl, entry.payload, {
      headers: { 'x-acg-signature': signature, 'x-acg-timestamp': Date.now().toString() },
      timeout: 8000,
    });
    await db.webhookDelivery.create({
      data: { outboxId: entry.id, merchantId: merchant.id, url: merchant.fulfillmentWebhookUrl,
               statusCode: res.status, succeeded: res.status < 300 }
    });
    await db.outbox.update({ where: { id: entry.id }, data: { status: 'DONE' } });
  } catch (err) {
    await db.webhookDelivery.create({
      data: { outboxId: entry.id, merchantId: merchant.id, url: merchant.fulfillmentWebhookUrl,
               statusCode: err.response?.status ?? 0, succeeded: false }
    });
    throw err; // let BullMQ's built-in retry/backoff handle it
  }
}, {
  connection: redisConnection,
  concurrency: 10,
});

// Queue config with exponential backoff + jitter, defined where jobs are added:
await fulfillmentQueue.add('notify', { outboxId }, {
  attempts: 6,
  backoff: { type: 'exponential', delay: 3000 }, // 3s, 6s, 12s... capped
});
```

After max attempts, BullMQ moves it to `failed` — add a listener that flips the order to `FULFILLMENT_MANUAL_REVIEW` and emails/notifies the merchant via dashboard alert. This is important: **money was captured, so this can never silently drop.** A human (you or the merchant) needs to see it.

**Merchant-facing requirement:** document that their webhook endpoint must return `2xx` within ~8s or it's treated as failed and retried — this is standard practice (same as Stripe/Razorpay's own webhook contract) and merchants integrating with you will expect it.

---

# Phase 3: Production Agent Authentication

A flat API key is fine for a demo. Production needs revocable, scoped, short-lived credentials — because agents are third parties you don't fully control, and a leaked long-lived key is a much bigger blast radius.

## 3.1 OAuth2 Client Credentials flow

```prisma
model AgentClient {
  id            String   @id @default(uuid())
  name          String
  clientId      String   @unique
  clientSecretHash String // bcrypt hash, never store plaintext
  scopes        String[] // ['catalog:read', 'cart:write', 'checkout:write']
  revoked       Boolean  @default(false)
  createdAt     DateTime @default(now())
}
```

```typescript
// POST /oauth/token
router.post('/oauth/token', async (req, res) => {
  const { client_id, client_secret, grant_type } = req.body;
  if (grant_type !== 'client_credentials') return res.status(400).json({ error: 'unsupported_grant_type' });

  const client = await db.agentClient.findUnique({ where: { clientId: client_id } });
  if (!client || client.revoked || !(await bcrypt.compare(client_secret, client.clientSecretHash))) {
    return res.status(401).json({ error: 'invalid_client' });
  }

  const accessToken = jwt.sign(
    { sub: client.id, scopes: client.scopes },
    process.env.JWT_SIGNING_KEY,
    { algorithm: 'RS256', expiresIn: '1h' }
  );
  res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600 });
});
```

```typescript
// src/middleware/authenticateAgent.ts
export async function authenticateAgent(requiredScope: string) {
  return async (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'missing_token' });
    try {
      const payload = jwt.verify(token, process.env.JWT_PUBLIC_KEY, { algorithms: ['RS256'] });
      if (!payload.scopes.includes(requiredScope)) return res.status(403).json({ error: 'insufficient_scope' });
      req.agentId = payload.sub;
      next();
    } catch {
      return res.status(401).json({ error: 'invalid_or_expired_token' });
    }
  };
}
```
Now every route declares what it needs: `router.post('/checkout_sessions', authenticateAgent('checkout:write'), ...)`. This gives you real `agentId`-scoped velocity caps and audit trails, and a revoked agent is locked out instantly without you rotating a shared secret.

## 3.2 Rate limiting tied to identity

```typescript
async function rateLimit(agentId: string, limit = 100, windowSec = 60) {
  const key = `ratelimit:${agentId}:${Math.floor(Date.now() / (windowSec * 1000))}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSec);
  if (count > limit) throw new RateLimitError();
}
```

---

# Phase 4: Production AI Agent Client

Build this as a proper package, not a throwaway script — because it's the thing that will actually get demoed live and possibly reused by pilot merchants' end users.

```typescript
// agent-client/src/agent.ts
import Anthropic from '@anthropic-ai/sdk';

export class ShoppingAgent {
  private client = new Anthropic();
  private messages: any[] = [];

  constructor(private tools: ToolSchema[], private acgClient: AcgApiClient) {}

  async chat(userInput: string): Promise<string> {
    this.messages.push({ role: 'user', content: userInput });

    while (true) {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        tools: this.tools,
        messages: this.messages,
      });
      this.messages.push({ role: 'assistant', content: response.content });

      const toolUses = response.content.filter(b => b.type === 'tool_use');
      if (toolUses.length === 0) {
        return response.content.find(b => b.type === 'text')?.text ?? '';
      }

      const toolResults = [];
      for (const use of toolUses) {
        // human-in-the-loop confirmation gate before any checkout call
        if (use.name === 'initiate_checkout' && !(await this.confirmWithUser(use.input))) {
          toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: 'User declined to proceed.' });
          continue;
        }
        try {
          const result = await this.acgClient.callTool(use.name, use.input);
          toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(result) });
        } catch (err) {
          // feed the structured ACG error back, never a raw stack trace — stops hallucinated recovery
          toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(err.structuredError), is_error: true });
        }
      }
      this.messages.push({ role: 'user', content: toolResults });
    }
  }

  private async confirmWithUser(checkoutInput): Promise<boolean> {
    console.log(`\n💳 Agent wants to spend ₹${checkoutInput.amount / 100} on your behalf.`);
    return await promptYesNo('Confirm? (y/n): ');
  }
}
```

**Why the human-in-the-loop gate matters for a production pitch:** even with your server-side Gate, a merchant evaluating this for trust will ask "does the *end user* also get a checkpoint before real money moves?" Having it in the client layer too is a strong answer, and it's cheap to add.

**CLI entry point:**
```typescript
// agent-client/src/cli.ts
const acgClient = new AcgApiClient({ baseUrl: process.env.ACG_BASE_URL, clientId, clientSecret });
const agent = new ShoppingAgent(await acgClient.fetchToolSchemas(), acgClient);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('line', async (input) => console.log(await agent.chat(input)));
```

Also expose the same `ShoppingAgent` class behind a minimal web chat page later — same logic, just swap the CLI I/O for a React chat component. Don't duplicate the agent loop for CLI vs web.

---

# Phase 5: Merchant Dashboard — Razorpay-themed, human-feel

This is where "looks AI-generated" usually comes from: default shadcn purple/blue gradients, glassmorphism cards, bouncy spring animations everywhere, emoji in headings. Razorpay's actual dashboard is calm, dense with real information, flat surfaces, and restrained motion. Let's replicate that specifically.

## 5.1 Stack

```
Next.js 15 (App Router) + TypeScript
Tailwind CSS (customized tokens, not defaults)
shadcn/ui (base components, heavily restyled)
Framer Motion (for the restrained animations, not the bouncy defaults)
Recharts (for the audit/revenue charts — matches Razorpay's own chart style)
NextAuth (or Clerk) for merchant login
```

## 5.2 Design tokens — the actual Razorpay feel

```css
/* globals.css */
:root {
  --brand-navy: #0C2451;      /* Razorpay's dark navy, used sparingly for headers/sidebar */
  --brand-blue: #3395FF;      /* primary action color */
  --brand-blue-hover: #1C7EF2;
  --surface: #FFFFFF;
  --surface-muted: #F7F9FC;   /* Razorpay's characteristic pale blue-gray background */
  --border: #E4E8F0;          /* thin, visible, not a shadow-only separation */
  --text-primary: #1A1F36;
  --text-secondary: #6B7280;
  --success: #1DB854;
  --danger: #D92D20;
  --warning: #F79009;
  --radius: 8px;              /* Razorpay uses modest rounding, not pill-shaped everything */
  --font-sans: 'Inter', -apple-system, sans-serif;
}
```

**Rules that make it feel human-designed, not AI-default:**
- No gradients on buttons or cards. Flat `--brand-blue`, solid fills.
- Borders, not shadows, for card separation (`1px solid var(--border)`), with only a very subtle shadow on hover/focus (`box-shadow: 0 1px 2px rgba(0,0,0,0.04)`).
- Data density over whitespace-heavy "hero" sections — merchants want to see numbers, not marketing copy, once logged in.
- Monospace font (`ui-monospace`) specifically for API keys, transaction IDs, hashes — this one detail alone reads as "built by someone who's used real dashboards" versus AI-generated demos that render everything in the body font.

## 5.3 Page structure

```
/app
  /login
  /dashboard
    /page.tsx              → overview: revenue via agents, active syncs, recent transactions
    /catalog/page.tsx      → connected products, sync status, manual "Sync now" button
    /catalog/connect/page.tsx → the API connection wizard (see below)
    /gate/page.tsx         → policy config (caps, allowlist, velocity)
    /audit/page.tsx        → TransactionEvent explorer, filterable, expandable timeline per transaction
    /webhooks/page.tsx     → WebhookDelivery log, retry button on failed ones
    /agents/page.tsx       → AgentClient management (issue/revoke credentials)
    /settings/page.tsx     → Razorpay key connection, webhook signing secret
```

## 5.4 The "magic part" — API connection wizard

This is the highest-value screen since it's literally your onboarding funnel. Build it as a 3-step wizard, not one long form:

```tsx
// Step 1: paste URL, fetch a live sample
<Card>
  <Input placeholder="https://your-store.com/api/products" value={url} onChange={...} />
  <Button onClick={fetchSample}>Test Connection</Button>
  {sample && <CodeBlock language="json">{JSON.stringify(sample, null, 2)}</CodeBlock>}
</Card>

// Step 2: field mapping — dropdown per canonical field, populated from the sample's actual keys
<div className="grid grid-cols-2 gap-4">
  {['title', 'price', 'stock', 'image', 'sku'].map(field => (
    <div key={field}>
      <Label>{field}</Label>
      <Select onValueChange={(path) => setFieldMap(f => ({ ...f, [field]: path }))}>
        {detectedJsonPaths(sample).map(path => <SelectItem value={path}>{path}</SelectItem>)}
      </Select>
    </div>
  ))}
</div>

// Step 3: live preview before saving
<PreviewTable products={applyMapping(sample, fieldMap)} />
<Button onClick={saveAndStartSync}>Save & Start Syncing</Button>
```

`detectedJsonPaths` just walks the sample JSON and lists every leaf path — turns "type a JSONPath expression" (developer task) into "pick from a dropdown" (merchant task). This single UX choice is what separates a real product from a script with a form on top.

## 5.5 Animation spec — restrained, not bouncy

```tsx
// Page transitions — subtle fade+slide, not spring-bounce
const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

// Success confirmation — like Razorpay's checkout tick, a single clean draw-in, not confetti
<motion.svg initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, ease: 'easeInOut' }}>
  <motion.path d="M5 13l4 4L19 7" stroke="var(--success)" strokeWidth={2} fill="none" />
</motion.svg>

// Skeleton loaders instead of spinners for data tables — feels native to real dashboards
<Skeleton className="h-4 w-full bg-[var(--surface-muted)]" />

// Toasts — slide from bottom-right, short duration, no bounce
transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] }  // standard material easing curve, not spring()
```

**Hard rule for the whole UI:** every transition duration between 120–250ms, every easing curve `ease-out` or a cubic-bezier, never Framer's default `type: 'spring'` with visible overshoot. Spring-bounce-everywhere is the single most common tell of an AI-scaffolded UI — real fintech dashboards (Razorpay, Stripe, Linear) use fast, flat, slightly-eased motion because their users are doing work, not being delighted.

## 5.6 Audit trail viewer — your best differentiator, make it visual

```tsx
<div className="border-l-2 border-[var(--border)] pl-4 space-y-3">
  {events.map(event => (
    <div key={event.id} className="relative">
      <div className="absolute -left-[21px] w-2.5 h-2.5 rounded-full"
           style={{ background: statusColor(event.eventType) }} />
      <p className="text-sm font-mono text-[var(--text-secondary)]">{event.eventType}</p>
      <p className="text-sm">{event.payload.reason}</p>
      <p className="text-xs text-[var(--text-secondary)]">{formatTimestamp(event.createdAt)}</p>
    </div>
  ))}
</div>
```
This is literally the same visual as the audit timeline diagram I suggested earlier — build the diagram first in Figma/Whimsical, then implement this component to match it 1:1. It'll feel deliberate rather than generated because it already exists as a design decision, not just a data dump.

---

# Suggested build order given unlimited time

1. Agent authentication (unblocks correct audit trails everywhere downstream)
2. Fulfillment dispatcher (closes the transactional loop)
3. AI agent client (gives you something to test everything else against, end to end)
4. Ingestion engine production hardening (circuit breaker, diffing, SyncRun)
5. Dashboard — build catalog connection + audit viewer first (highest trust-signal screens), settings/agents pages last

This order means at every stage you have a working, demoable slice — never a half-built system with nothing to show.