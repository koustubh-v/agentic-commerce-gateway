import Link from 'next/link';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import CursorGrid from '@/components/ui/CursorGrid';
import LandingEffects from '@/components/ui/LandingEffects';
import ScrollReveal from '@/components/ui/ScrollReveal';
import LogoMarquee from '@/components/ui/LogoMarquee';
import styles from './page.module.css';
import treatment from './razorpay-treatment.module.css';
import heroFocus from './hero-focus.module.css';

export const metadata: Metadata = {
  title: 'Agent Commerce Gateway — Agent-ready payments',
  description: 'The secure commerce layer for AI agents, powered by Razorpay.',
};

const capabilities = [
  ['01', 'Universal catalog', 'Normalize any existing store API into a clean, agent-readable catalog.'],
  ['02', 'Purchase controls', 'Set spend limits, category rules and velocity controls before an order can move.'],
  ['03', 'Reliable checkout', 'Create Razorpay orders server-side without exposing payment credentials to agents.'],
];

const workflow = [
  ['01', 'Connect', 'Add your catalog endpoint and map the fields you already have.'],
  ['02', 'Control', 'Define who can buy, what they can buy, and how much they can spend.'],
  ['03', 'Transact', 'Let trusted agents discover, order, pay and fulfil with a full audit trail.'],
];

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" className={styles.arrow}><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" /></svg>;
}

function CheckIcon() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" className={styles.check}><path d="m3.25 8.25 2.9 2.9 6.6-6.6" /></svg>;
}

import { auth } from '@/lib/auth';
import LogoutButton from '@/components/ui/LogoutButton';

export default async function LandingPage() {
  const session = await auth();

  const faqs = [
    {
      question: "Why do I need to add my Razorpay keys to ACG?",
      answer: "In production, ACG uses a Bring Your Own Key (BYOK) architecture or Razorpay Route. By using your exact credentials, the gateway provisions orders natively on your account, ensuring funds go directly to you without ACG holding the money."
    },
    {
      question: "If ACG processes the agent's payment, how does my website know the order was paid?",
      answer: "ACG uses bidirectional webhooks. When an agent successfully completes a payment, ACG verifies the transaction and fires a secure fulfillment webhook directly to your underlying store's API (e.g., Shopify or custom backend)."
    },
    {
      question: "What if my website strictly requires native Razorpay webhooks to fulfill orders?",
      answer: "Because ACG provisions the order using your actual Razorpay credentials, the transaction lives in your Razorpay dashboard. Razorpay will fire its standard webhooks directly to your website just as if a human had paid on your checkout page."
    }
  ];

  return (
    <main className={styles.page}>
      <LandingEffects />
      <nav className={`${styles.nav} ${heroFocus.nav}`} data-landing-nav aria-label="Main navigation">
        <Link href="/" className={styles.brand} aria-label="Agent Commerce Gateway home"><span className={styles.brandMark}><span /></span><span>ACG</span></Link>
        <div className={styles.navLinks}><a href="#platform">Platform</a><a href="#how-it-works">How it works</a><a href="#security">Security</a></div>
        <div className={styles.navActions}>
          {session ? (
            <LogoutButton />
          ) : (
            <>
              <Link className={styles.login} href="/login">Log in</Link>
              <Link className={styles.smallCta} href="/login?tab=signup">Get started <ArrowIcon /></Link>
            </>
          )}
        </div>
      </nav>

      <section className={`${styles.hero} ${treatment.hero} ${heroFocus.hero}`} data-landing-hero>
        <video autoPlay muted playsInline className={heroFocus.heroVideo}>
          <source src="/HeroVid.mp4" type="video/mp4" />
        </video>
        <div className={styles.heroGrid} aria-hidden="true" />
        <CursorGrid className={styles.cursorGrid} color="#2878ee" cellSize={62} radius={170} lineWidth={1.25} maxOpacity={0.82} fillOpacity={0.05} gridOpacity={0.11} cellRadius={7} />
        <div className={styles.orbit} aria-hidden="true"><span /><span /><span /></div>
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>INTRODUCING</p>
          <h1>Agentic<br />Commerce<br /><em>Gateway</em></h1>
          <p className={styles.lede}>The secure commerce layer for a new generation of shoppers. Connect your catalog, enforce policies, and let trusted agents transact.</p>
          <div className={styles.heroActions}>
            {session ? (
              <Link href={session.user.role === 'admin' ? '/admin/dashboard' : '/merchant/dashboard'} className={styles.primaryCta}>Go to Dashboard <ArrowIcon /></Link>
            ) : (
              <Link href="/login?tab=signup" className={styles.primaryCta}>Get started <ArrowIcon /></Link>
            )}
          </div>
          <div className={styles.trustRow}><span>Catalog connection</span><span>Policy controls</span><span>Secure checkout</span></div>
        </div>
        <div className={styles.productWindow} aria-label="Example secure agent order workflow">
          <div className={styles.windowTop}><span className={styles.windowDots}><i /><i /><i /></span><span>acg / transaction monitor</span><span className={styles.live}><i /> LIVE</span></div>
          <div className={styles.windowBody}>
            <div className={styles.orderHeader}><div><span className={styles.miniLabel}>AGENT REQUEST</span><strong>Order #ACG-1048</strong></div><span className={styles.approved}>Approved</span></div>
            <div className={styles.orderLine}><span className={styles.agentIcon}>A</span><div><strong>Shopping agent</strong><small>Intent verified · 10:42:18 IST</small></div><b>₹ 2,499</b></div>
            <div className={styles.flowLine}><span>CATALOG</span><i /><span>POLICY GATE</span><i /><span>RAZORPAY</span></div>
            <div className={styles.receipt}><div><span>Spend policy</span><b>Within limit</b></div><div><span>Payment method</span><b>Secure token</b></div><div><span>Fulfilment</span><b>Webhook queued</b></div></div>
          </div>
        </div>
      </section>

      <section style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <LogoMarquee />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', padding: '3rem 0 5rem 5rem' }}>
          <div style={{ borderRight: '1px dashed #d4d4d8', paddingRight: '4rem' }}>
            <ScrollReveal
              baseOpacity={0.15}
              baseRotation={0}
              blurStrength={0}
              containerClassName="text-left w-full"
              textClassName="hero-statement"
              enableBlur={false}
            >
              Commerce is shifting from clicks to conversations. Yet agents still transact outside any guardrail. Agent Commerce Gateway brings every autonomous purchase into a governed layer, so transactions happen only at the speed your policies allow.
            </ScrollReveal>
          </div>
          <div />
        </div>
      </section>

      <section id="platform" style={{
        background: 'linear-gradient(135deg, #e0e7ff 0%, #ede9fe 30%, #ccfbf1 100%)',
        position: 'relative',
        overflow: 'hidden',
        padding: '6rem 0 8rem',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(to right, #CBD5E1 1px, transparent 1px), linear-gradient(to bottom, #CBD5E1 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          backgroundPosition: 'center top',
          opacity: 0.6,
        }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: '1px', background: '#CBD5E1', opacity: 0.8 }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '25%', width: '1px', background: '#CBD5E1', opacity: 0.4, borderLeft: '1px dashed #CBD5E1' }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: '25%', width: '1px', background: '#CBD5E1', opacity: 0.4, borderLeft: '1px dashed #CBD5E1' }} />

        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 4rem', position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '2rem' }}>
              <div style={{ flex: '0 0 40%', paddingTop: '2rem' }}>
                <h2 style={{ fontSize: '3rem', fontWeight: 600, color: '#0f172a', lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 0 1.25rem 0' }}>
                  The Commerce Layer<br />for the Agentic Era
                </h2>
                <p style={{ fontSize: '1.05rem', color: '#475569', lineHeight: 1.7, margin: 0 }}>
                  We give every AI agent a governed path to transact. From product discovery to policy to payment, ACG is the missing infrastructure layer.
                </p>
              </div>

              <div style={{
                flex: '0 0 52%',
                background: '#ffffff',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06), 0 10px 15px -3px rgba(0,0,0,0.1)',
                padding: '2.5rem',
                transform: 'rotate(1deg)',
                position: 'relative',
                marginTop: '1rem',
              }}>
                <div style={{
                  position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)',
                  width: 44, height: 44, borderRadius: '50%', background: '#f8fafc',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 10,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1.5rem', marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#64748b', textTransform: 'uppercase' }}>Policy Layer</span>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>Policy Enforcement Gate</h3>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#0f172a', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Spend Controls (Live)</div>
                    <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.6, margin: 0 }}>Enable consent-based, pre-authorized payments that allow AI agents to transact securely within approved spending limits.</p>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#0f172a', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Category Rules (Live)</div>
                    <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.6, margin: 0 }}>Allowlist and blocklist product categories so agents only buy exactly what they are authorised to purchase.</p>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: '65%',
                background: '#ffffff',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06), 0 10px 15px -3px rgba(0,0,0,0.1)',
                padding: '2rem 2.5rem',
                transform: 'rotate(-1deg)',
                position: 'relative',
                marginLeft: '3rem',
              }}>
                <div style={{
                  position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)',
                  width: 44, height: 44, borderRadius: '50%', background: '#f8fafc',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 10,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                  </svg>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1rem', marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#64748b', textTransform: 'uppercase' }}>Catalog Layer</span>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>Universal Catalog API</h3>
                </div>
                <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.6, margin: 0 }}>Connect any WooCommerce store, custom merchant API or product database. ACG normalizes it into a clean, queryable feed any agent can browse, filter and act on instantly.</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{
                width: '58%',
                background: '#ffffff',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06), 0 10px 15px -3px rgba(0,0,0,0.1)',
                padding: '2.5rem',
                transform: 'rotate(1deg)',
                position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)',
                  width: 44, height: 44, borderRadius: '50%', background: '#f8fafc',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 10,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                  </svg>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1.5rem', marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#64748b', textTransform: 'uppercase' }}>Payment Layer</span>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>Secure Checkout</h3>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 2rem' }}>
                  {['Razorpay order creation', 'Human approval gate', 'No credential exposure', 'Webhook fulfilment', 'Audit ledger', 'Reconciliation'].map((item) => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#475569', fontFamily: 'monospace' }}>
                      <div style={{ width: '5px', height: '5px', background: '#0f172a', flexShrink: 0 }} />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>







      <section id="security" style={{ padding: '8rem 4rem', background: '#f9fafb', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6rem', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#525252', letterSpacing: '0.05em', marginBottom: '1rem', textTransform: 'uppercase' }}>CONTROL BY DEFAULT</p>
            <h2 style={{ fontSize: '3rem', fontWeight: 600, color: '#171717', lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 0 1.5rem 0' }}>Let agents move fast.<br />Keep every payment safe.</h2>
            <p style={{ fontSize: '1.1rem', color: '#525252', lineHeight: 1.6, marginBottom: '2.5rem', maxWidth: '480px' }}>ACG separates an agent&apos;s intent from payment execution. Your policy gate makes the final call on every transaction.</p>
            
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 3rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {['Spend, category and velocity policies', 'Server-side Razorpay order creation', 'Cryptographically chained audit ledger'].map((item) => (
                <li key={item} style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '1rem', color: '#171717', fontWeight: 500 }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckIcon />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
            
            <Link href="/login?tab=signup" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#171717', color: '#ffffff', padding: '0.75rem 1.5rem', borderRadius: '9999px', fontSize: '0.9rem', fontWeight: 600, textDecoration: 'none' }}>
              Explore the platform <ArrowIcon />
            </Link>
          </div>
          
          <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '24px', padding: '2.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f4f4f5', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: '48px', height: '48px', background: '#f4f4f5', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', color: '#171717' }}></div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#a3a3a3', letterSpacing: '0.05em' }}>ACTIVE POLICY</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#171717' }}>Autonomous purchasing</div>
                </div>
              </div>
              <div style={{ background: '#ecfdf5', color: '#10b981', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 }}>Enabled</div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {[
                { label: 'Per-order limit', value: '₹ 5,000' },
                { label: 'Allowed categories', value: '3 categories' },
                { label: 'Daily velocity', value: '12 / 20 orders' }
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1.25rem', borderBottom: '1px solid #f4f4f5' }}>
                  <span style={{ fontSize: '0.95rem', color: '#525252' }}>{label}</span>
                  <strong style={{ fontSize: '0.95rem', color: '#171717' }}>{value}</strong>
                </div>
              ))}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1.5rem', fontSize: '0.85rem', color: '#a3a3a3' }}>
              <span>Last evaluated</span>
              <strong style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '6px', height: '6px', background: '#10b981', borderRadius: '50%' }} /> 2 seconds ago
              </strong>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" style={{ padding: '8rem 4rem', background: '#ffffff' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '5rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#525252', letterSpacing: '0.05em', marginBottom: '1rem', textTransform: 'uppercase' }}>FROM STORE TO AGENT-READY</p>
            <h2 style={{ fontSize: '3rem', fontWeight: 600, color: '#171717', lineHeight: 1.1, letterSpacing: '-0.03em', margin: 0 }}>Simple by design.<br />Serious by default.</h2>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4rem', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '24px', left: '15%', right: '15%', height: '2px', background: '#f4f4f5', zIndex: 0 }} />
            {workflow.map(([number, title, copy]) => (
              <article key={number} style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                <div style={{ width: '48px', height: '48px', background: '#ffffff', border: '2px solid #e5e5e5', borderRadius: '50%', margin: '0 auto 2rem auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 600, color: '#525252' }}>
                  {number}
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#171717', marginBottom: '1rem' }}>{title}</h3>
                <p style={{ fontSize: '1rem', color: '#525252', lineHeight: 1.6, margin: 0 }}>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" style={{ padding: '8rem 4rem', background: '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#525252', letterSpacing: '0.05em', marginBottom: '1rem', textTransform: 'uppercase' }}>COMMON QUESTIONS</p>
            <h2 style={{ fontSize: '3rem', fontWeight: 600, color: '#171717', lineHeight: 1.1, letterSpacing: '-0.03em', margin: 0 }}>How the architecture works.</h2>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {faqs.map((faq, idx) => (
              <div key={idx} style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#171717', marginBottom: '1rem' }}>{faq.question}</h3>
                <p style={{ fontSize: '1rem', color: '#525252', lineHeight: 1.6, margin: 0 }}>{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '8rem 4rem', background: '#171717', color: '#ffffff', textAlign: 'center' }}>
        <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#a1a1aa', letterSpacing: '0.05em', marginBottom: '1.5rem', textTransform: 'uppercase' }}>READY WHEN YOU ARE</p>
        <h2 style={{ fontSize: '3.5rem', fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 auto 1.5rem auto', maxWidth: '800px' }}>Build the store agents<br />will want to shop from.</h2>
        <p style={{ fontSize: '1.1rem', color: '#a1a1aa', marginBottom: '3rem' }}>Connect your catalog and start testing in minutes.</p>
        <Link href="/login?tab=signup" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#ffffff', color: '#171717', padding: '1rem 2rem', borderRadius: '9999px', fontSize: '1rem', fontWeight: 600, textDecoration: 'none' }}>
          Create your account <ArrowIcon />
        </Link>
      </section>

      <footer style={{ padding: '3rem 4rem', background: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e5e7eb', fontSize: '0.9rem', color: '#525252' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none', color: '#171717', fontWeight: 600 }}>
          <div style={{ width: '24px', height: '24px', background: '#171717', color: '#fff', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>A</div>
          <span>Agent Commerce Gateway</span>
        </Link>
        <span>Built for Razorpay Buildathon 2026</span>
        <Link href="/login" style={{ color: '#171717', textDecoration: 'none', fontWeight: 500 }}>
          Merchant login <ArrowIcon />
        </Link>
      </footer>
    </main>
  );
}
