import Link from 'next/link';
import { ArrowLeft, ShieldAlert, Zap, Lock, BugOff, ServerCrash, Cpu } from 'lucide-react';
import styles from '@/app/dashboard.module.css';

export const metadata = {
  title: 'Build Challenges | Agent Commerce Gateway'
};

export default function ChallengesPage() {
  const challenges = [
    {
      title: "Securely Bridging Autonomous Agents with Client-Side Checkout",
      icon: <Lock className="text-blue-500" size={24} style={{ color: '#3b82f6' }} />,
      challenge: "Agents are server-side scripts, but Razorpay's secure checkout widget requires a human-in-the-loop client-side interaction. We needed a way for an AI agent to initiate an order, hit our policy engine, and then seamlessly pass the session to a human for payment execution without exposing the merchant's underlying API keys to the agent.",
      solution: "We designed a tokenized Hand-off Architecture. When an agent successfully passes the Policy Gate, the Gateway provisions a secure server-side order with Razorpay and generates a unique, one-time checkoutToken. The agent simply surfaces a secure URL containing this token to the human user. The Next.js frontend then securely resolves the token back into the payment intent, loading the Razorpay UI completely isolated from the agent's logic."
    },
    {
      title: "Next.js 15 Async Routing & Prisma Query Edge Cases",
      icon: <BugOff className="text-red-500" size={24} style={{ color: '#ef4444' }} />,
      challenge: "While building the dynamic checkout page (/checkout/[token]), we ran into a critical bug where every checkout link rendered the exact same product, regardless of the token.",
      solution: "We discovered this was caused by a Next.js 15 routing quirk where params are now Promises. By accessing params.token synchronously, it evaluated to undefined. When passed to our Prisma database query (where: { checkoutToken: undefined }), Prisma interpreted undefined as 'do not filter on this field,' returning the first record in the entire database. We solved this by explicitly awaiting the params promise before querying the database."
    },
    {
      title: "Simulating Webhooks for Local Development & Demo Environments",
      icon: <ServerCrash className="text-orange-500" size={24} style={{ color: '#f97316' }} />,
      challenge: "In production, when a human completes the Razorpay checkout, Razorpay fires a webhook back to our core backend (localhost:3000) to mark the transaction as PAID. However, during local development and live demonstrations, Razorpay's external servers cannot reach a local localhost port.",
      solution: "Instead of forcing judges or users to set up complex Ngrok tunnels just to test the platform, we built a fallback simulation using Next.js Server Actions. Upon a successful callback from the Razorpay JS SDK on the frontend, our Client Component triggers a secure Server Action that directly mimics the exact database updates the webhook would perform."
    },
    {
      title: "Environment Variable Isolation Across Microservices",
      icon: <Cpu className="text-purple-500" size={24} style={{ color: '#a855f7' }} />,
      challenge: "Our architecture splits the core Gateway (Fastify API) and the Merchant Dashboard (Next.js) into separate directories. During the integration of the Razorpay checkout widget, the Next.js frontend kept failing to initialize because it couldn't read the RAZORPAY_KEY_ID from the root .env file.",
      solution: "Rather than duplicating .env files and risking credential desynchronization, we implemented a robust fallback chain on the checkout page. The system first attempts to fetch the specific Merchant's Bring-Your-Own-Key credentials from the database; if missing, it gracefully falls back to the system environment, and finally to a hardcoded test key."
    }
  ];

  const rules = [
    {
      name: "Per-Transaction Cap (Velocity Rule)",
      description: "Blocks any transaction where the total amount exceeds the allowed per-order threshold (e.g. ₹10,000 max).",
      errorCode: "per_transaction_cap"
    },
    {
      name: "Category Allowance (Content Rule)",
      description: "Blocks agents from purchasing items that belong to unauthorized or blocklisted categories (e.g. 'Weapons', 'Alcohol').",
      errorCode: "category_restricted"
    },
    {
      name: "Daily Spend Limit (Budget Rule)",
      description: "Keeps a running tally of agent spend over 24 hours. Blocks transactions that push the agent over their daily budget.",
      errorCode: "daily_budget_exceeded"
    }
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column', color: '#0f172a' }}>
      <header style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '1rem 2rem', display: 'flex', alignItems: 'center' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: '#475569', fontSize: '0.9rem', fontWeight: 500 }}>
          <ArrowLeft size={16} /> Back to Home
        </Link>
      </header>

      <main style={{ flex: 1, maxWidth: '900px', margin: '0 auto', padding: '4rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#3b82f6', letterSpacing: '0.05em', marginBottom: '1rem', textTransform: 'uppercase' }}>Behind the Scenes</p>
          <h1 style={{ fontSize: '3rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.1, letterSpacing: '-0.03em', margin: 0 }}>Build Challenges &<br/>Technical Obstacles</h1>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginBottom: '5rem' }}>
          {challenges.map((item, idx) => (
            <div key={idx} style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '2.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ padding: '0.75rem', background: '#f1f5f9', borderRadius: '12px' }}>
                  {item.icon}
                </div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>{item.title}</h2>
              </div>
              
              <div style={{ display: 'grid', gap: '1.5rem' }}>
                <div>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>The Challenge</h3>
                  <p style={{ fontSize: '1rem', color: '#475569', lineHeight: 1.6, margin: 0 }}>{item.challenge}</p>
                </div>
                <div>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>The Solution</h3>
                  <p style={{ fontSize: '1rem', color: '#334155', lineHeight: 1.6, margin: 0 }}>{item.solution}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: '#0f172a', borderRadius: '16px', padding: '3rem', color: '#f8fafc', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
            <ShieldAlert size={32} style={{ color: '#3b82f6' }} />
            <h2 style={{ fontSize: '2rem', fontWeight: 600, margin: 0 }}>Gate Guardian Conditions</h2>
          </div>
          <p style={{ fontSize: '1.1rem', color: '#94a3b8', marginBottom: '3rem', lineHeight: 1.6 }}>
            The core feature of the Agent Commerce Gateway is its strict policy enforcement layer. Before any order is pushed to Razorpay, the transaction is evaluated against these critical guardrails.
          </p>

          <div style={{ display: 'grid', gap: '1.5rem' }}>
            {rules.map((rule, idx) => (
              <div key={idx} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>{rule.name}</h3>
                  <code style={{ fontSize: '0.75rem', background: '#0f172a', color: '#ef4444', padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid #7f1d1d' }}>
                    {rule.errorCode}
                  </code>
                </div>
                <p style={{ fontSize: '0.95rem', color: '#cbd5e1', lineHeight: 1.5, margin: 0 }}>
                  {rule.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
