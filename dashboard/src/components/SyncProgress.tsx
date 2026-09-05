'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Package } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';
import styles from '@/app/dashboard.module.css';

export default function SyncProgress({ 
  initialCount, 
  hasConfig 
}: { 
  initialCount: number, 
  hasConfig: boolean 
}) {
  const router = useRouter();
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    if (!hasConfig) return;
    
    // Poll every 3 seconds for updated count
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/merchant/status', { cache: 'no-store' });
        const data = await res.json();
        if (data.isConnected && data.productCount !== undefined) {
          setCount(data.productCount);
        }
      } catch (e) {
        console.error('Error polling status', e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [hasConfig]);

  if (!hasConfig) {
    return (
      <div className={styles.onboardingOverlay}>
        <div className={styles.onboardingModal}>
          <h2>Welcome to Agent Commerce Gateway</h2>
          <p>
            Your agents are ready, but they need access to your products.
            Connect your existing store API to get started. No complex integrations required!
          </p>
          <button 
            className={styles.btnPrimary} 
            onClick={() => router.push('/merchant/connect')}
            style={{ marginTop: '1.5rem', width: '100%' }}
          >
            Connect Store Now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.metricCard}>
      <div className={styles.iconBadge} style={{ background: '#ecfdf5', color: '#10b981' }}>
        <Package size={18} />
      </div>
      <div className={styles.metricValue}>
        {count.toLocaleString()}
      </div>
      <div className={styles.metricLabel}>
        Products Synced
        <Tooltip content="Number of products successfully synced from your store API. Updates in real-time." />
      </div>
    </div>
  );
}
