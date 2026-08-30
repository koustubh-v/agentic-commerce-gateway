import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/client.js';
import { commerceCreateCart, commerceAddItem, commerceInitiateCheckout, commerceGetTransactionStatus, commerceGetOrderByCheckoutToken, commerceUpdateCart, commerceCancelCheckout } from '../commerce/actions.js';
import { GateRejectionError, CartStateError, InventoryLockError } from '../commerce/errors.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { authenticateAgent, rateLimitAgent } from './auth.js';

export async function acpRouter(fastify: FastifyInstance) {

  fastify.post('/oauth/token', async (request: FastifyRequest, reply: FastifyReply) => {
    const { client_id, client_secret, grant_type } = request.body as any;
    if (grant_type !== 'client_credentials') {
      return reply.status(400).send({ error: 'unsupported_grant_type' });
    }

    const client = await prisma.agentClient.findUnique({ where: { clientId: client_id } });
    if (!client || client.revoked || !(await bcrypt.compare(client_secret, client.clientSecretHash))) {
      return reply.status(401).send({ error: 'invalid_client' });
    }

    const accessToken = fastify.jwt.sign(
      { sub: client.id, scopes: client.scopes },
      { expiresIn: '1h' }
    );
    return reply.send({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600 });
  });

  fastify.get('/feed', { preHandler: authenticateAgent('catalog:read') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { merchantId } = request.query as { merchantId: string };

    if (!merchantId) {
      return reply.status(400).send({ error: 'merchantId is required' });
    }

    const products = await prisma.product.findMany({
      where: { merchantId, status: 'ACTIVE', agentPurchasable: true },
      include: { variants: true },
    });

    const feed = products.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      price: Number(p.price),
      currency: p.currency,
      availability: p.availability,
      variants: p.variants.map(v => ({
        id: v.id,
        title: v.title,
        price: v.price ? Number(v.price) : Number(p.price),
      })),
    }));

    return reply.send({ feed });
  });

  fastify.post('/checkout_sessions', { preHandler: authenticateAgent('checkout:write') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const agentId = (request as any).agentId;
    await rateLimitAgent(agentId, 50, 3600); 
    
    const body = request.body as {
      merchantId: string;
      items: Array<{ productId: string; variantId?: string; quantity: number }>;
      agentCallbackUrl?: string;
    };

    if (!body.merchantId || !body.items?.length) {
      return reply.status(400).send({ error: 'merchantId and items are required' });
    }

    try {
      const agentSessionId = uuidv4();
      const cart = await commerceCreateCart(body.merchantId, agentSessionId);

      for (const item of body.items) {
        await commerceAddItem(cart.id, item.productId, item.variantId, item.quantity);
      }

      const updatedCart = await prisma.cart.findUniqueOrThrow({
        where: { id: cart.id },
        include: { items: true, mandates: { orderBy: { issuedAt: 'desc' }, take: 1 } },
      });

      const latestMandate = updatedCart.mandates[0];
      if (!latestMandate) {
        return reply.status(500).send({ error: 'Failed to create cart mandate' });
      }

      const result = await commerceInitiateCheckout(
        cart.id,
        latestMandate.stateHash,
        uuidv4(),
        agentSessionId,
      );

      if (body.agentCallbackUrl) {
        await prisma.order.update({
          where: { id: result.orderId },
          data: { agentCallbackUrl: body.agentCallbackUrl }
        });
      }

      return reply.send({
        checkoutSessionId: result.orderId,
        checkoutToken: result.checkoutToken,
        razorpayOrderId: result.razorpayOrderId,
        razorpayKeyId: result.keyId,
        amount: result.amount,
        currency: result.currency,
        gateDecision: result.gateDecision,
      });

    } catch (err: any) {
      if (err instanceof GateRejectionError) {
        return reply.status(403).send({ error: err.message, rule: err.rule });
      }
      if (err instanceof CartStateError) {
        return reply.status(409).send({ error: err.message });
      }
      if (err instanceof InventoryLockError) {
        return reply.status(409).send({ error: err.message });
      }
      request.log.error(err);
      return reply.status(500).send({ error: err.message ?? 'Checkout failed' });
    }
  });

  fastify.get('/checkout_sessions/:id', { preHandler: authenticateAgent('checkout:read') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      const result = await commerceGetTransactionStatus(id);
      return reply.send(result);
    } catch {
      return reply.status(404).send({ error: 'Transaction not found' });
    }
  });

  fastify.patch('/checkout_sessions/:id', { preHandler: authenticateAgent('checkout:write') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { items: Array<{ productId: string; variantId?: string; quantity: number }> };
    try {
      const result = await commerceUpdateCart(id, body.items);
      return reply.send({ status: 'updated', cart: result });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/checkout_sessions/:id/complete', { preHandler: authenticateAgent('checkout:write') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await commerceGetTransactionStatus(id);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(404).send({ error: 'Transaction not found' });
    }
  });

  fastify.post('/checkout_sessions/:id/cancel', { preHandler: authenticateAgent('checkout:write') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    try {
      await commerceCancelCheckout(id);
      return reply.send({ status: 'cancelled' });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
