import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/client.js';
import { createCart } from '../ir/cart.js';
import { createOrderFromCart } from '../ir/orders.js';
import { runGate } from '../payments/gate.js';
import { v4 as uuidv4 } from 'uuid';

export async function acpRouter(fastify: FastifyInstance) {
  
  // -------------------------------------------------------------------------
  // ACP /feed Endpoint
  // Returns a compressed feed of active products for the given merchant
  // -------------------------------------------------------------------------
  fastify.get('/feed', async (request: FastifyRequest, reply: FastifyReply) => {
    const { merchantId } = request.query as { merchantId: string };
    
    if (!merchantId) {
      return reply.status(400).send({ error: 'merchantId is required' });
    }

    const products = await prisma.product.findMany({
      where: {
        merchantId,
        status: 'ACTIVE',
        agentPurchasable: true,
      },
      include: {
        variants: true,
      }
    });

    // Simplify the feed per ACP guidelines (minimal necessary tokens for LLM)
    const feed = products.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      price: p.price,
      currency: p.currency,
      availability: p.availability,
      variants: p.variants.map((v) => ({
        id: v.id,
        title: v.title,
        price: v.price || p.price,
      })),
    }));

    return reply.send({ feed });
  });

  // -------------------------------------------------------------------------
  // ACP /checkout_sessions Endpoint
  // Creates a checkout session (cart + order + payment intent)
  // -------------------------------------------------------------------------
  fastify.post('/checkout_sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    const { merchantId, items, customerInfo, returnUrl } = request.body as {
      merchantId: string;
      items: { productId: string; variantId?: string; quantity: number }[];
      customerInfo?: { email?: string; name?: string };
      returnUrl?: string;
    };

    if (!merchantId || !items || items.length === 0) {
      return reply.status(400).send({ error: 'merchantId and items are required' });
    }

    try {
      const agentSessionId = uuidv4(); // Generate session ID for the agent

      // 1. Create a cart
      const cart = await createCart(merchantId, { items, agentSessionId });

      // 2. Create the order from the cart
      const customerData = {
        ...(customerInfo?.email ? { email: customerInfo.email } : {}),
        ...(customerInfo?.name ? { name: customerInfo.name } : {})
      };
      
      const order = await createOrderFromCart(
        cart.id,
        merchantId,
        agentSessionId,
        returnUrl,
        customerData
      );

      // 3. Process payment action (Money-Action Gate)
      const gateResult = await runGate({
        merchantId,
        agentSessionId,
        amount: order.total,
        currency: order.currency,
        cartTotal: order.total,
        productIds: cart.items.map((i: any) => i.productId),
        correlationId: order.id
      });

      if (gateResult.decision === 'REJECTED') {
        return reply.status(403).send({ error: gateResult.message });
      }

      // ACP standard response format
      return reply.send({
        checkoutSessionId: order.id,
        status: order.status,
        checkoutUrl: `https://checkout.example.com/${order.id}`, // Stubbed until Razorpay integration returns URL
        expiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
      });
      
    } catch (err: any) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to create checkout session', details: err.message });
    }
  });
}
