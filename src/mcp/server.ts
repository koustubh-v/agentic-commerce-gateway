import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getProducts, getProduct } from "../ir/products.js";
import { commerceCreateCart, commerceAddItem, commerceInitiateCheckout, commerceGetTransactionStatus } from "../commerce/actions.js";
import { GateRejectionError, CartStateError, InventoryLockError, mapRazorpayError } from "../commerce/errors.js";
import { v4 as uuidv4 } from "uuid";

const transports = new Map<string, SSEServerTransport>();

export function registerMcpServer(app: FastifyInstance) {
  const server = new Server(
    { name: "agent-commerce-gateway", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "search_products",
        description: "Search for products by query, category, or price range.",
        inputSchema: {
          type: "object",
          properties: {
            merchantId: { type: "string", description: "The merchant to search within" },
            query: { type: "string", description: "Search term for product title/description" },
            category: { type: "string" },
            maxPrice: { type: "number" },
          },
          required: ["merchantId"],
        },
      },
      {
        name: "get_product_details",
        description: "Get full details for a product including variants, inventory, and pricing.",
        inputSchema: {
          type: "object",
          properties: {
            merchantId: { type: "string" },
            productId: { type: "string" },
          },
          required: ["merchantId", "productId"],
        },
      },
      {
        name: "create_cart",
        description: "Create a new shopping cart for this session.",
        inputSchema: {
          type: "object",
          properties: { merchantId: { type: "string" } },
          required: ["merchantId"],
        },
      },
      {
        name: "add_to_cart",
        description: "Add a product to the cart. Returns the updated cart with a state_hash for checkout.",
        inputSchema: {
          type: "object",
          properties: {
            cartId: { type: "string" },
            productId: { type: "string" },
            variantId: { type: "string" },
            quantity: { type: "number", default: 1 },
          },
          required: ["cartId", "productId"],
        },
      },
      {
        name: "initiate_checkout",
        description: "Initiate checkout for a cart. Requires the state_hash from the last cart operation. Returns a checkout token and Razorpay order for payment.",
        inputSchema: {
          type: "object",
          properties: {
            cartId: { type: "string" },
            stateHash: { type: "string", description: "The state_hash from the last add_to_cart response" },
            idempotencyKey: { type: "string", description: "Unique key to prevent duplicate checkouts" },
          },
          required: ["cartId", "stateHash"],
        },
      },
      {
        name: "get_transaction_status",
        description: "Get the status of a payment transaction including its full audit trail.",
        inputSchema: {
          type: "object",
          properties: { transactionId: { type: "string" } },
          required: ["transactionId"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "search_products": {
          const { merchantId, query, category, maxPrice } = args as any;
          const result = await getProducts(merchantId, {
            ...(query ? { search: query } : {}),
            ...(category ? { category } : {}),
            ...(maxPrice ? { maxPrice } : {}),
          });
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        case "get_product_details": {
          const { merchantId, productId } = args as any;
          const result = await getProduct(merchantId, productId);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        case "create_cart": {
          const { merchantId } = args as any;
          const agentSessionId = uuidv4();
          const cart = await commerceCreateCart(merchantId, agentSessionId);
          return { content: [{ type: "text", text: JSON.stringify({ ...cart, agentSessionId }, null, 2) }] };
        }

        case "add_to_cart": {
          const { cartId, productId, variantId, quantity } = args as any;
          const cart = await commerceAddItem(cartId, productId, variantId, quantity ?? 1);
          return { content: [{ type: "text", text: JSON.stringify(cart, null, 2) }] };
        }

        case "initiate_checkout": {
          const { cartId, stateHash, idempotencyKey } = args as any;
          const agentSessionId = uuidv4();
          const result = await commerceInitiateCheckout(
            cartId,
            stateHash,
            idempotencyKey ?? uuidv4(),
            agentSessionId,
          );
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        case "get_transaction_status": {
          const { transactionId } = args as any;
          const result = await commerceGetTransactionStatus(transactionId);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }

        default:
          return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
      }
    } catch (error: any) {
      if (error instanceof GateRejectionError) {
        return {
          content: [{ type: "text", text: JSON.stringify({
            error: 'gate_rejected',
            rule: error.rule,
            decision: error.decision,
            message: error.message,
          }, null, 2) }],
          isError: true,
        };
      }
      if (error instanceof CartStateError) {
        return {
          content: [{ type: "text", text: JSON.stringify({
            error: 'cart_state_changed',
            message: error.message,
          }, null, 2) }],
          isError: true,
        };
      }
      if (error instanceof InventoryLockError) {
        return {
          content: [{ type: "text", text: JSON.stringify({
            error: 'inventory_locked',
            variantId: error.variantId,
            message: error.message,
          }, null, 2) }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: 'commerce_error',
          message: error.message ?? 'An unexpected error occurred.',
        }, null, 2) }],
        isError: true,
      };
    }
  });

  app.get("/mcp/sse", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = uuidv4();
    const transport = new SSEServerTransport("/mcp/message", reply.raw as any);
    transports.set(sessionId, transport);
    request.raw.on("close", () => { transports.delete(sessionId); });
    await server.connect(transport);
  });

  app.post("/mcp/message", async (request: FastifyRequest, reply: FastifyReply) => {
    const transport = Array.from(transports.values())[0];
    if (!transport) {
      return reply.status(404).send("No active SSE connection");
    }
    await transport.handlePostMessage(request.raw as any, reply.raw as any);
  });
}
