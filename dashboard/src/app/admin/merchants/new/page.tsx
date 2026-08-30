'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '@/app/dashboard.module.css';

export default function NewMerchantPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ apiKey: string; email: string } | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [currency, setCurrency] = useState('INR');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, websiteUrl, currency }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to create merchant.');
      setLoading(false);
      return;
    }

    setDone({ apiKey: data.apiKey, email });
  }

  if (done) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Merchant Created</h1>
        </div>
        <div className={styles.formSection} style={{ maxWidth: '560px' }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#10b981', marginBottom: '1.5rem' }}>
            Merchant account created successfully. Share these credentials once.
          </div>
          {[
            { label: 'Login Email', value: done.email },
            { label: 'API Key', value: done.apiKey },
          ].map(({ label, value }) => (
            <div key={label} style={{ marginBottom: '1rem' }}>
              <div className={styles.metricLabel} style={{ marginBottom: '0.25rem' }}>{label}</div>
              <code style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', padding: '0.75rem', background: '#f4f4f5', borderRadius: '8px', color: 'var(--text-primary)', wordBreak: 'break-all', border: '1px solid var(--border-color)' }}>
                {value}
              </code>
            </div>
          ))}
          <button className={styles.btnSecondary} style={{ marginTop: '1rem' }} onClick={() => router.push('/admin/merchants')}>
            ← Back to Merchants
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Add Merchant</h1>
          <p className={styles.pageSubtitle}>Manually onboard a new merchant with a generated API key.</p>
        </div>
      </div>

      <div className={styles.formSection} style={{ maxWidth: '560px' }}>
        {error && (
          <div style={{ padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', background: '#fef2f2', border: '1px solid #fecaca', fontSize: '0.85rem', color: '#ef4444' }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Business Name</label>
            <input type="text" className={styles.formInput} required value={name} onChange={e => setName(e.target.value)} placeholder="TechGadgets Store" />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Admin Email</label>
            <input type="email" className={styles.formInput} required value={email} onChange={e => setEmail(e.target.value)} placeholder="merchant@store.com" />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Initial Password</label>
            <input type="password" className={styles.formInput} required value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimum 8 characters" minLength={8} />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Website URL <span style={{ color: 'var(--text-tertiary)' }}>(optional)</span></label>
            <input type="url" className={`${styles.formInput} ${styles.mono}`} value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://merchant.com" />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Currency</label>
            <select className={styles.formInput} value={currency} onChange={e => setCurrency(e.target.value)}>
              <option value="INR">INR — Indian Rupee</option>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem' }}>
            <button type="submit" className={styles.btnPrimary} disabled={loading}>
              {loading ? 'Creating...' : 'Create Merchant →'}
            </button>
            <button type="button" className={styles.btnSecondary} onClick={() => router.back()}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
