import type { FastifyInstance } from 'fastify';
import {
  createMerchant,
  getMerchant,
  updateSyncConfig,
  updateMerchantPolicy,
  triggerManualSync,
  getMerchantSyncStatus,
} from './service.js';
import { prisma } from '../db/client.js';
import { API_PREFIX } from '../config/constants.js';

// ---------------------------------------------------------------------------
// Merchants REST API
// ---------------------------------------------------------------------------

export async function merchantRoutes(app: FastifyInstance): Promise<void> {

  // POST /merchants — onboard a new merchant
  app.post(`${API_PREFIX}/merchants`, async (req, reply) => {
    try {
      const result = await createMerchant(req.body as Parameters<typeof createMerchant>[0]);
      return reply.code(201).send({
        ...result,
        _note: 'Store your API key securely — it will not be shown again.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return reply.code(400).send({ error: msg });
    }
  });

  // GET /merchants/:id
  app.get(`${API_PREFIX}/merchants/:id`, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const merchant = await getMerchant(id);
      return reply.send(merchant);
    } catch {
      return reply.code(404).send({ error: 'Merchant not found.' });
    }
  });

  // PUT /merchants/:id/config — update Mode A sync configuration
  app.put(`${API_PREFIX}/merchants/:id/config`, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await updateSyncConfig(id, req.body);
      return reply.send({ success: true, message: 'Sync config updated. Polling job re-registered.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid config';
      return reply.code(400).send({ error: msg });
    }
  });

  // PUT /merchants/:id/policy — update agent purchase policy
  app.put(`${API_PREFIX}/merchants/:id/policy`, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await updateMerchantPolicy(id, req.body);
      return reply.send({ success: true, message: 'Policy updated.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid policy';
      return reply.code(400).send({ error: msg });
    }
  });

  // POST /merchants/:id/sync — trigger immediate one-shot sync
  app.post(`${API_PREFIX}/merchants/:id/sync`, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await triggerManualSync(id);
      return reply.send({ success: true, ...result, message: 'Sync job enqueued.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed to enqueue';
      return reply.code(500).send({ error: msg });
    }
  });

  // GET /merchants/:id/sync-logs — sync history and freshness
  app.get(`${API_PREFIX}/merchants/:id/sync-logs`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { limit = '20' } = req.query as { limit?: string };

    try {
      const [syncStatus, logs] = await Promise.all([
        getMerchantSyncStatus(id),
        prisma.syncLog.findMany({
          where: { merchantId: id },
          orderBy: { startedAt: 'desc' },
          take: parseInt(limit, 10),
          select: {
            id: true,
            status: true,
            entityType: true,
            recordsProcessed: true,
            recordsFailed: true,
            errorMessage: true,
            durationMs: true,
            startedAt: true,
            completedAt: true,
          },
        }),
      ]);

      return reply.send({ syncStatus, logs });
    } catch {
      return reply.code(404).send({ error: 'Merchant not found.' });
    }
  });

  // GET /merchants/:id/products — quick view of IR products for this merchant
  app.get(`${API_PREFIX}/merchants/:id/products`, async (req, reply) => {
    const { id } = req.params as { id: string };
    const products = await prisma.product.findMany({
      where: { merchantId: id, status: 'ACTIVE' },
      select: {
        id: true,
        externalId: true,
        title: true,
        price: true,
        currency: true,
        availability: true,
        isStale: true,
        lastSyncedAt: true,
        _count: { select: { variants: true } },
      },
      take: 100,
    });

    return reply.send({ count: products.length, products });
  });
}
