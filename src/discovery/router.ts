import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/client.js';

export async function discoveryRouter(fastify: FastifyInstance) {
  
  // -------------------------------------------------------------------------
  // AI Plugin Manifest
  // Tells ChatGPT-like agents how to interact with this ACP implementation
  // -------------------------------------------------------------------------
  fastify.get('/.well-known/ai-plugin.json', async (request: FastifyRequest, reply: FastifyReply) => {
    // Return standard AI Plugin manifest for ACP
    return reply.send({
      schema_version: "v1",
      name_for_human: "Agent Commerce Gateway",
      name_for_model: "agent_commerce_gateway",
      description_for_human: "A universal Agentic Commerce Protocol endpoint.",
      description_for_model: "Plugin for searching products and creating checkout sessions using the Agentic Commerce Protocol.",
      auth: {
        type: "none"
      },
      api: {
        type: "openapi",
        url: "https://your-domain.com/openapi.yaml", // Replace with actual OpenAPI spec URL
        is_user_authenticated: false
      },
      logo_url: "https://your-domain.com/logo.png",
      contact_email: "support@your-domain.com",
      legal_info_url: "https://your-domain.com/legal"
    });
  });

  // -------------------------------------------------------------------------
  // llms.txt (Human/LLM readable summary)
  // Used by agents that scrape the site but don't have tool calling
  // -------------------------------------------------------------------------
  fastify.get('/llms.txt', async (request: FastifyRequest, reply: FastifyReply) => {
    const { merchantId } = request.query as { merchantId?: string };
    
    let content = "# Agent Commerce Gateway\n\nThis is an AI-ready commerce gateway.\n\n";

    if (merchantId) {
      const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId }
      });

      if (merchant) {
        content += `## Store: ${merchant.name}\n\n`;
        content += `Currency: ${merchant.currency}\n\n`;
        
        const products = await prisma.product.findMany({
          where: { merchantId, status: 'ACTIVE', agentPurchasable: true },
          take: 50 // Limit to avoid massive text files
        });

        content += "### Products\n\n";
        products.forEach(p => {
          content += `- **${p.title}** (${p.currency} ${p.price}): ${p.description || 'No description'}\n`;
        });
        
        content += `\nTo purchase, use the Agentic Commerce Protocol endpoints at /acp/checkout_sessions or via MCP.\n`;
      }
    } else {
      content += "Please provide a `?merchantId=` query parameter to see specific store products.\n";
    }

    return reply.type('text/plain').send(content);
  });
}
