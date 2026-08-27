import Anthropic from '@anthropic-ai/sdk';

export class ShoppingAgent {
  private anthropic: Anthropic;
  private acgBaseUrl: string;
  private acgToken: string;

  constructor(apiKey: string, acgBaseUrl: string, acgToken: string) {
    this.anthropic = new Anthropic({ apiKey });
    this.acgBaseUrl = acgBaseUrl;
    this.acgToken = acgToken;
  }

  async getFeed(merchantId: string) {
    const res = await fetch(`${this.acgBaseUrl}/acp/feed?merchantId=${merchantId}`, {
      headers: {
        'Authorization': `Bearer ${this.acgToken}`,
      },
    });
    if (!res.ok) throw new Error(`Failed to fetch feed: ${res.statusText}`);
    return await res.json();
  }

  async createCheckoutSession(merchantId: string, items: Array<{ productId: string, variantId?: string, quantity: number }>) {
    const res = await fetch(`${this.acgBaseUrl}/acp/checkout_sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.acgToken}`,
      },
      body: JSON.stringify({ merchantId, items }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create checkout session');
    }
    return data;
  }

  async runConversation(merchantId: string, userPrompt: string) {
    console.log('🤖 Agent thinking...');
    
    // Step 1: Get the catalog
    const feed = await this.getFeed(merchantId);
    
    // Step 2: Use LLM to pick items
    const message = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 1024,
      system: `You are an autonomous shopping agent. The user will ask you to buy something. You have access to a product catalog. Find the best matching item(s) and output ONLY a JSON array of items to buy. Do not include markdown formatting or explanations. Format: [{ "productId": "id", "variantId": "vid", "quantity": 1 }]`,
      messages: [
        { role: 'user', content: `Catalog: ${JSON.stringify(feed.feed)}\n\nUser request: ${userPrompt}` }
      ]
    });
    
    const textResponse = (message.content[0] as any).text;
    
    try {
      const items = JSON.parse(textResponse);
      return items;
    } catch (e) {
      throw new Error(`Agent failed to output valid JSON: ${textResponse}`);
    }
  }
}
