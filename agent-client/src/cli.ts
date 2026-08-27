import inquirer from 'inquirer';
import { ShoppingAgent } from './agent.js';

const ACG_BASE_URL = process.env.ACG_BASE_URL || 'http://localhost:3000';
const ACG_CLIENT_ID = process.env.ACG_CLIENT_ID || 'client_id_placeholder';
const ACG_CLIENT_SECRET = process.env.ACG_CLIENT_SECRET || 'client_secret_placeholder';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MERCHANT_ID = process.env.MERCHANT_ID || 'merchant_id_placeholder';

async function getAccessToken() {
  const res = await fetch(`${ACG_BASE_URL}/acp/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: ACG_CLIENT_ID,
      client_secret: ACG_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error('Failed to authenticate with ACG');
  const data = await res.json();
  return data.access_token;
}

async function main() {
  console.log('🤖 Agent Commerce Client Initializing...');
  
  if (!ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY');
    process.exit(1);
  }

  // console.log('Authenticating with ACG...');
  // const token = await getAccessToken();
  // We'll skip real auth for this CLI demo unless env vars are provided
  const token = 'dummy_token'; // Should use real token when fully tested
  
  const agent = new ShoppingAgent(ANTHROPIC_API_KEY, ACG_BASE_URL, token);

  const { query } = await inquirer.prompt([
    {
      type: 'input',
      name: 'query',
      message: 'What would you like to buy today?'
    }
  ]);

  try {
    const items = await agent.runConversation(MERCHANT_ID, query);
    
    console.log('\n🛒 Agent selected the following items:');
    console.log(JSON.stringify(items, null, 2));

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Proceed to checkout with these items?',
        default: true
      }
    ]);

    if (!confirm) {
      console.log('Checkout cancelled.');
      return;
    }

    console.log('Initiating checkout session...');
    const session = await agent.createCheckoutSession(MERCHANT_ID, items);
    
    console.log('\n✅ Checkout Session Created!');
    console.log('Checkout Token:', session.checkoutToken);
    console.log('Razorpay Order ID:', session.razorpayOrderId);
    console.log('Amount:', session.amount, session.currency);
    console.log('\nUse this token to complete the payment.');

  } catch (err: any) {
    console.error('Agent encountered an error:', err.message);
  }
}

main().catch(console.error);
