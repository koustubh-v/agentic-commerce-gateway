import type { FastifyInstance } from 'fastify';
import { getProducts, getProduct } from '../ir/products.js';
import { getCart } from '../ir/cart.js';
import { getOrder, getOrderEventLog } from '../ir/orders.js';
import { API_PREFIX } from '../config/constants.js';
import type { ProductFilters } from '../types/ir.js';

// ---------------------------------------------------------------------------
// IR Read API — agent-facing read-only endpoints
// These expose the canonical IR to agents (and for debugging).
// In Phase 2, these will be wrapped by MCP tools.
// ---------------------------------------------------------------------------

export async function irRoutes(app: FastifyInstance): Promise<void> {

  // GET /ir/products/:merchantId — list products
  app.get(`${API_PREFIX}/ir/products/:merchantId`, async (req, reply) => {
    const { merchantId } = req.params as { merchantId: string };
    const query = req.query as {
      category?: string;
      availability?: string;
      minPrice?: string;
      maxPrice?: string;
      agentPurchasable?: string;
      search?: string;
      limit?: string;
      offset?: string;
    };

    const filters: ProductFilters = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.availability ? { availability: query.availability as NonNullable<ProductFilters['availability']> } : {}),
      ...(query.minPrice ? { minPrice: parseFloat(query.minPrice) } : {}),
      ...(query.maxPrice ? { maxPrice: parseFloat(query.maxPrice) } : {}),
      ...(query.agentPurchasable !== undefined ? { agentPurchasable: query.agentPurchasable === 'true' } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(query.limit ? { limit: parseInt(query.limit, 10) } : {}),
      ...(query.offset ? { offset: parseInt(query.offset, 10) } : {}),
    };

    const result = await getProducts(merchantId, filters);
    return reply.send(result);
  });

  // GET /ir/products/:merchantId/:productId — single product
  app.get(`${API_PREFIX}/ir/products/:merchantId/:productId`, async (req, reply) => {
    const { merchantId, productId } = req.params as { merchantId: string; productId: string };
    const result = await getProduct(merchantId, productId);
    if (!result) return reply.code(404).send({ error: 'Product not found.' });
    return reply.send(result);
  });

  // GET /ir/carts/:cartId
  app.get(`${API_PREFIX}/ir/carts/:cartId`, async (req, reply) => {
    const { cartId } = req.params as { cartId: string };
    const cart = await getCart(cartId);
    if (!cart) return reply.code(404).send({ error: 'Cart not found.' });
    return reply.send({ data: cart });
  });

  // GET /ir/orders/:orderId
  app.get(`${API_PREFIX}/ir/orders/:orderId`, async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const order = await getOrder(orderId);
    if (!order) return reply.code(404).send({ error: 'Order not found.' });
    return reply.send({ data: order });
  });

  // GET /ir/orders/:orderId/events — full audit event log
  app.get(`${API_PREFIX}/ir/orders/:orderId/events`, async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const events = await getOrderEventLog(orderId);
    return reply.send({ orderId, events });
  });
}
