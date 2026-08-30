'use client';

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from '@/app/dashboard.module.css';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get('tab') === 'signup' ? 'signup' : 'signin';

  const [tab, setTab] = useState<'signin' | 'signup'>(defaultTab as any);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [name, setName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [apiKey, setApiKey] = useState(''); 

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn('credentials', {
      email, password, redirect: false,
    });

    if (result?.error) {
      setError('Invalid email or password.');
      setLoading(false);
      return;
    }

    const sessionRes = await fetch('/api/auth/session');
    const session = await sessionRes.json();
    
    if (session?.user?.role === 'admin') {
      router.push('/admin/dashboard');
    } else {
      router.push('/merchant/dashboard');
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email: signupEmail, password: signupPassword, websiteUrl }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Registration failed.');
      setLoading(false);
      return;
    }

    setApiKey(data.apiKey);

    setTimeout(async () => {
      await signIn('credentials', {
        email: signupEmail,
        password: signupPassword,
        redirect: false,
      });
      router.push('/merchant/dashboard');
    }, 3000);
  }

  return (
    <div className={styles.dashboardTheme} style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      background: '#f9fafb',
    }}>
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '440px', padding: '1.5rem' }}>
        {}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem', justifyContent: 'center', textDecoration: 'none' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: '#171717',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, color: 'white', fontSize: '1rem',
          }}>A</div>
          <span style={{ fontWeight: 600, fontSize: '1.1rem', color: '#171717' }}>Agent Commerce</span>
        </Link>

        {}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          padding: '2rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        }}>
          {}
          {apiKey && (
            <div style={{
              background: '#ecfdf5',
              border: '1px solid #10b981',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
            }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#047857', marginBottom: '0.5rem' }}>
                Store registered! Save your API key — shown only once.
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)', wordBreak: 'break-all', background: '#ffffff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1fae5', marginTop: '0.5rem' }}>
                {apiKey}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#047857', marginTop: '0.75rem' }}>
                Redirecting to dashboard in 3 seconds...
              </div>
            </div>
          )}

          {}
          <div style={{
            display: 'flex', background: '#f4f4f5',
            borderRadius: '9999px', padding: '4px', marginBottom: '2rem',
          }}>
            {(['signin', 'signup'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(''); }}
                style={{
                  flex: 1, padding: '0.5rem', border: 'none', borderRadius: '9999px',
                  fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: tab === t ? '#ffffff' : 'transparent',
                  color: tab === t ? '#171717' : '#71717a',
                  boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                {t === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          {error && (
            <div style={{
              padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem',
              background: '#fef2f2', border: '1px solid #fecaca',
              fontSize: '0.85rem', color: '#ef4444',
            }}>{error}</div>
          )}

          {tab === 'signin' ? (
            <form onSubmit={handleSignIn}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#171717', marginBottom: '0.5rem' }}>Email address</label>
                <input id="signin-email" type="email" className={styles.formInput} required
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#171717', marginBottom: '0.5rem' }}>Password</label>
                <input id="signin-password" type="password" className={styles.formInput} required
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" />
              </div>
              <button id="signin-btn" type="submit" className={styles.btnPrimary}
                style={{ width: '100%', justifyContent: 'center', padding: '0.75rem' }}
                disabled={loading}>
                {loading ? 'Signing in...' : 'Sign in →'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUp}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#171717', marginBottom: '0.5rem' }}>Store / Business Name</label>
                <input id="signup-name" type="text" className={styles.formInput} required
                  value={name} onChange={e => setName(e.target.value)}
                  placeholder="My E-Commerce Store" />
              </div>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#171717', marginBottom: '0.5rem' }}>Email address</label>
                <input id="signup-email" type="email" className={styles.formInput} required
                  value={signupEmail} onChange={e => setSignupEmail(e.target.value)}
                  placeholder="you@example.com" />
              </div>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#171717', marginBottom: '0.5rem' }}>Password</label>
                <input id="signup-password" type="password" className={styles.formInput} required
                  value={signupPassword} onChange={e => setSignupPassword(e.target.value)}
                  placeholder="••••••••" minLength={8} />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#171717', marginBottom: '0.5rem' }}>Website URL <span style={{ color: '#a1a1aa' }}>(optional)</span></label>
                <input id="signup-url" type="url" className={styles.formInput}
                  value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)}
                  placeholder="https://yourstore.com" />
              </div>
              <button id="signup-btn" type="submit" className={styles.btnPrimary}
                style={{ width: '100%', justifyContent: 'center', padding: '0.75rem' }}
                disabled={loading}>
                {loading ? 'Creating account...' : 'Create Account →'}
              </button>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#a1a1aa', marginTop: '1.5rem' }}>
          Agent Commerce Gateway — Test Mode
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
