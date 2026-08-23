import type { FastifyInstance } from 'fastify';
import { processMerchantWebhook } from '../sync/webhook-receiver.js';
import { validateApiKey } from '../merchants/service.js';
import crypto from 'crypto';
import { API_PREFIX } from '../config/constants.js';

// ---------------------------------------------------------------------------
// Inbound Merchant Webhook Handler
// POST /webhooks/merchant/:merchantId
//
// Merchant → ACG: order updates (cancel, fulfill, refund, ship)
// Auth: X-ACG-Merchant-Key (API key) + X-ACG-Signature (HMAC of body)
// ---------------------------------------------------------------------------

export async function merchantWebhookRoutes(app: FastifyInstance): Promise<void> {

  app.post(`${API_PREFIX}/webhooks/merchant/:merchantId`, async (req, reply) => {
    const { merchantId } = req.params as { merchantId: string };
    const apiKey = req.headers['x-acg-merchant-key'] as string | undefined;
    const signature = req.headers['x-acg-signature'] as string | undefined;

    if (!apiKey) {
      return reply.code(401).send({ error: 'Missing X-ACG-Merchant-Key header.' });
    }

    // Validate API key
    const resolvedMerchantId = await validateApiKey(apiKey);

    if (!resolvedMerchantId || resolvedMerchantId !== merchantId) {
      return reply.code(401).send({ error: 'Invalid or unauthorized API key.' });
    }

    // Verify HMAC signature if provided
    if (signature) {
      const { prisma } = await import('../db/client.js');
      const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId },
        select: { webhookSigningSecret: true },
      });

      if (merchant?.webhookSigningSecret) {
        const body = JSON.stringify(req.body);
        const expected = crypto
          .createHmac('sha256', merchant.webhookSigningSecret)
          .update(body)
          .digest('hex');

        const sigBuf = Buffer.from(signature.replace(/^sha256=/, ''));
        const expectedBuf = Buffer.from(expected);

        if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
          return reply.code(401).send({ error: 'Invalid webhook signature.' });
        }
      }
    }

    const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? crypto.randomUUID();

    const result = await processMerchantWebhook(merchantId, req.body, correlationId);

    if (!result.success) {
      return reply.code(422).send({ error: result.message });
    }

    return reply.send({
      received: true,
      orderId: result.orderId,
      message: result.message,
      correlationId,
    });
  });
}
