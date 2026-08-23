import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getProducts, getProduct } from "../ir/products.js";
import { createCart, updateCart, getCart } from "../ir/cart.js";
import { createOrderFromCart, getOrder } from "../ir/orders.js";
import { runGate } from "../payments/gate.js";
import { v4 as uuidv4 } from "uuid";

// Store active SSE transports
const transports = new Map<string, SSEServerTransport>();

export function registerMcpServer(app: FastifyInstance) {
  const server = new Server(
    {
      name: "agent-commerce-gateway",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register Tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "search_products",
          description: "Search for products by query or view all products.",
          inputSchema: {
            type: "object",
            properties: {
              merchantId: { type: "string" },
              query: { type: "string" },
            },
            required: ["merchantId"],
          },
        },
        {
          name: "get_product_details",
          description: "Get detailed information about a product, including its variants.",
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
          description: "Create a new shopping cart.",
          inputSchema: {
            type: "object",
            properties: {
              merchantId: { type: "string" },
              agentSessionId: { type: "string" },
            },
            required: ["merchantId"],
          },
        },
        {
          name: "add_to_cart",
          description: "Add a product variant to an existing cart.",
          inputSchema: {
            type: "object",
            properties: {
              cartId: { type: "string" },
              productId: { type: "string" },
              variantId: { type: "string" },
              quantity: { type: "number" },
            },
            required: ["cartId", "productId", "quantity"],
          },
        },
        {
          name: "checkout_cart",
          description: "Checkout the cart and get a payment link.",
          inputSchema: {
            type: "object",
            properties: {
              cartId: { type: "string" },
              customerEmail: { type: "string" },
              customerName: { type: "string" },
              agentCallbackUrl: { type: "string" },
            },
            required: ["cartId"],
          },
        },
        {
          name: "get_order_status",
          description: "Get the current status of an order.",
          inputSchema: {
            type: "object",
            properties: {
              orderId: { type: "string" },
            },
            required: ["orderId"],
          },
        },
      ],
    };
  });

  // Handle Tool Execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params;
      
      switch (name) {
        case "search_products": {
          const { merchantId, query } = args as any;
          const result = await getProducts(merchantId, query ? { search: query } : undefined);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }
        case "get_product_details": {
          const { merchantId, productId } = args as any;
          const result = await getProduct(merchantId, productId);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }
        case "create_cart": {
          const { merchantId, agentSessionId } = args as any;
          const cart = await createCart(merchantId, { items: [], agentSessionId });
          return {
            content: [{ type: "text", text: JSON.stringify(cart, null, 2) }],
          };
        }
        case "add_to_cart": {
          const { cartId, productId, variantId, quantity } = args as any;
          const currentCart = await getCart(cartId);
          if (!currentCart) throw new Error("Cart not found");
          
          const newItems = [...currentCart.items, { productId, variantId, quantity }] as any;
          const cart = await updateCart(cartId, currentCart.merchantId, { 
            items: newItems,
            version: currentCart.version
          });
          return {
            content: [{ type: "text", text: JSON.stringify(cart, null, 2) }],
          };
        }
        case "checkout_cart": {
          const { cartId, customerEmail, customerName, agentCallbackUrl } = args as any;
          
          const cart = await getCart(cartId);
          if (!cart) throw new Error("Cart not found");

          const agentSessionId = uuidv4();
          
          // 1. Convert cart to order
          const customerData = {
            ...(customerEmail ? { email: customerEmail } : {}),
            ...(customerName ? { name: customerName } : {})
          };
          
          const order = await createOrderFromCart(
            cartId,
            cart.merchantId,
            agentSessionId,
            agentCallbackUrl,
            customerData
          );

          // 2. Pass through the Money-Action Gate
          const result = await runGate({
            merchantId: order.merchantId,
            agentSessionId,
            amount: order.total,
            currency: order.currency,
            cartTotal: order.total,
            productIds: cart.items.map((i: any) => i.productId),
            correlationId: order.id
          });

          if (result.decision === 'REJECTED') {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: result.message }, null, 2) }],
              isError: true,
            };
          }

          return {
            content: [{ type: "text", text: JSON.stringify({
              orderId: order.id,
              status: order.status,
              checkoutUrl: `https://checkout.example.com/${order.id}`,
              gateOutcome: result.decision
            }, null, 2) }],
          };
        }
        case "get_order_status": {
          const { orderId } = args as any;
          const order = await getOrder(orderId);
          return {
            content: [{ type: "text", text: JSON.stringify(order, null, 2) }],
          };
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  });

  // Fastify SSE Endpoint
  app.get("/mcp/sse", async (request: FastifyRequest, reply: FastifyReply) => {
    const sessionId = uuidv4();
    const transport = new SSEServerTransport("/mcp/message", reply.raw as any);
    
    transports.set(sessionId, transport);
    
    request.raw.on("close", () => {
      transports.delete(sessionId);
    });

    await server.connect(transport);
  });

  // Fastify Message Endpoint
  app.post("/mcp/message", async (request: FastifyRequest, reply: FastifyReply) => {
    // A simplified approach for single-server: we route to the first available transport
    const transport = Array.from(transports.values())[0];
    if (!transport) {
      return reply.status(404).send("No active SSE connection");
    }

    await transport.handlePostMessage(request.raw as any, reply.raw as any);
  });
}
