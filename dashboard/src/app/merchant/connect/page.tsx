'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Tooltip from '@/components/ui/Tooltip';
import styles from '@/app/dashboard.module.css';

export default function ConnectPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const [productsEndpoint, setProductsEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isEditing, setIsEditing] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    fetch('/api/merchant/connect', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data.productsEndpoint) {
          setProductsEndpoint(data.productsEndpoint);
          setIsEditing(false); // If they have data, it's read-only
        }
        setInitialLoad(false);
      })
      .catch(console.error);
  }, []);

  async function handleConnect() {
    setSaving(true);
    try {
      const res = await fetch('/api/merchant/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productsEndpoint,
          // other fields can be added here
        }),
      });
      if (res.ok) {
        setDone(true);
        setTimeout(() => {
          router.refresh(); // Clear Next.js client-side cache!
          router.push('/merchant/dashboard');
        }, 1500);
      } else {
        alert('Failed to connect store');
        setSaving(false);
      }
    } catch (e) {
      console.error(e);
      alert('Error connecting store');
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className={styles.page} style={{ textAlign: 'center', paddingTop: '10rem' }}>
        <h2 className={styles.pageTitle} style={{ color: '#10b981' }}>Connected successfully</h2>
        <p className={styles.pageSubtitle}>Redirecting to your dashboard...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Connect Store</h1>
          <p className={styles.pageSubtitle}>Provide your API details to let agents read your catalog and place orders.</p>
        </div>
        {!isEditing && (
          <button className={styles.btnSecondary} onClick={() => setIsEditing(true)}>
            Edit Connection
          </button>
        )}
      </div>

      {initialLoad ? (
        <p>Loading...</p>
      ) : (
      <div className={styles.formSection}>
        <div className={styles.stepRow}>
          <div className={styles.stepNumber}>1</div>
          <div className={styles.stepContent}>
            <div className={styles.stepTitle}>
              Razorpay Keys
              <Tooltip content="Your Gateway relies on Razorpay to process payments securely. Find these in your Razorpay Dashboard under API Keys." />
            </div>
            <div className={styles.formGroup} style={{ marginBottom: '1rem' }}>
              <input type="text" className={`${styles.formInput} ${styles.mono}`} placeholder="Key ID (rzp_test_...)" disabled={!isEditing} />
            </div>
            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <input type="password" className={`${styles.formInput} ${styles.mono}`} placeholder="Key Secret..." disabled={!isEditing} />
            </div>
          </div>
        </div>

        <div style={{ height: '1px', background: 'var(--border-color)', margin: '2rem 0 2rem 2.5rem' }} />

        <div className={styles.stepRow}>
          <div className={styles.stepNumber}>2</div>
          <div className={styles.stepContent}>
            <div className={styles.stepTitle}>
              Store API Details
              <Tooltip content="The endpoint where ACG can fetch your product catalog. Must return JSON." />
            </div>
            <div className={styles.formGroup} style={{ marginBottom: '1rem' }}>
              <input type="url" className={`${styles.formInput} ${styles.mono}`} value={productsEndpoint} onChange={e => setProductsEndpoint(e.target.value)} placeholder="Catalog Endpoint (https://api.yourstore.com/products)" disabled={!isEditing} />
            </div>
            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <input type="password" className={`${styles.formInput} ${styles.mono}`} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="API Token (Bearer ...)" disabled={!isEditing} />
            </div>
          </div>
        </div>

        <div style={{ height: '1px', background: 'var(--border-color)', margin: '2rem 0 2rem 2.5rem' }} />

        <div className={styles.stepRow}>
          <div className={styles.stepNumber}>3</div>
          <div className={styles.stepContent}>
            <div className={styles.stepTitle}>
              Fulfillment Webhook
              <Tooltip content="When an agent successfully completes a payment, we will send an HTTP POST here so you can ship the order." />
            </div>
            <div className={styles.formGroup} style={{ marginBottom: 0 }}>
              <input type="url" className={`${styles.formInput} ${styles.mono}`} value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="Webhook URL (https://api.yourstore.com/webhooks/orders)" disabled={!isEditing} />
            </div>
          </div>
        </div>
      </div>
      )}

      {isEditing && !initialLoad && (
        <button className={styles.btnPrimary} onClick={handleConnect} disabled={saving || !productsEndpoint}>
          {saving ? 'Connecting & Syncing...' : 'Connect & Sync'}
        </button>
      )}
    </div>
  );
}
