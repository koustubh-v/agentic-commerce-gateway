import Link from 'next/link';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import CursorGrid from '@/components/ui/CursorGrid';
import LandingEffects from '@/components/ui/LandingEffects';
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

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <LandingEffects />
      <nav className={`${styles.nav} ${heroFocus.nav}`} data-landing-nav aria-label="Main navigation">
        <Link href="/" className={styles.brand} aria-label="Agent Commerce Gateway home"><span className={styles.brandMark}><span /></span><span>ACG</span></Link>
        <div className={styles.navLinks}><a href="#platform">Platform</a><a href="#how-it-works">How it works</a><a href="#security">Security</a></div>
        <div className={styles.navActions}><Link className={styles.login} href="/login">Log in</Link><Link className={styles.smallCta} href="/login?tab=signup">Get started <ArrowIcon /></Link></div>
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
          <div className={styles.heroActions}><Link href="/login?tab=signup" className={styles.primaryCta}>Get started <ArrowIcon /></Link></div>
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

      <section style={{ borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', background: '#ffffff', padding: '2rem 4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', fontWeight: 600, color: '#a3a3a3', letterSpacing: '0.05em' }}>
        <p style={{ margin: 0 }}>ONE LAYER. EVERY TRANSACTION COVERED.</p>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <span>DISCOVER</span><div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#e5e5e5' }} />
          <span>DECIDE</span><div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#e5e5e5' }} />
          <span>PAY</span><div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#e5e5e5' }} />
          <span>FULFIL</span><div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#e5e5e5' }} />
          <span>RECONCILE</span>
        </div>
      </section>

      <section style={{ background: '#f9fafb', padding: '6rem 4rem', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>
        <p style={{ maxWidth: '800px', margin: '0 auto', fontSize: '2rem', fontWeight: 500, color: '#171717', lineHeight: 1.3, letterSpacing: '-0.02em' }}>
          Commerce is shifting from clicks to conversations.<br />
          ACG makes sure every agent-led transaction remains <em style={{ fontStyle: 'normal', color: '#171717', fontWeight: 600, background: 'linear-gradient(120deg, #f4f4f5 0%, #e5e5e5 100%)', padding: '0 0.5rem', borderRadius: '4px' }}>secure, governed and human-ready.</em>
        </p>
      </section>

      <section id="platform" style={{ padding: '8rem 4rem', background: '#ffffff' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ marginBottom: '4rem' }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#525252', letterSpacing: '0.05em', marginBottom: '1rem', textTransform: 'uppercase' }}>THE AGENT COMMERCE LAYER</p>
            <h2 style={{ fontSize: '3.5rem', fontWeight: 600, color: '#171717', lineHeight: 1.1, letterSpacing: '-0.03em', margin: 0 }}>Designed for the way<br />commerce is changing.</h2>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>
            {capabilities.map(([number, title, copy], index) => (
              <article key={number} style={{ padding: '2.5rem', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', transition: 'all 0.3s ease', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#a3a3a3', fontFamily: 'monospace' }}>{number}</span>
                <div style={{ width: '48px', height: '48px', background: '#f4f4f5', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '1.5rem 0', border: '1px solid #e5e5e5' }}>
                  <div style={{ width: '16px', height: '16px', border: '2px solid #171717', borderRadius: index === 1 ? '50% 50% 50% 0' : index === 2 ? '50% 0 50% 50%' : '4px', transform: 'rotate(45deg)' }} />
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#171717', marginBottom: '0.75rem' }}>{title}</h3>
                <p style={{ fontSize: '0.95rem', color: '#525252', lineHeight: 1.6, margin: 0 }}>{copy}</p>
              </article>
            ))}
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
                <div style={{ width: '48px', height: '48px', background: '#f4f4f5', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', color: '#171717' }}>⌘</div>
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
