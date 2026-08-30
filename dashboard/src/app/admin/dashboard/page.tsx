import { prisma } from '@/lib/prisma';
import { Store, Package, Activity, KeyRound, ArrowRight } from 'lucide-react';
import styles from '@/app/dashboard.module.css';

export default async function AdminDashboard() {
  const [merchantCount, productCount, txCount, agentCount, merchants] = await Promise.all([
    prisma.merchant.count(),
    prisma.product.count(),
    prisma.transactionEvent.count(),
    prisma.agentClient.count(),
    prisma.merchant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        _count: { select: { products: true } },
        syncConfig: true,
      },
    }),
  ]);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Global Overview</h1>
          <p className={styles.pageSubtitle}>Platform-wide metrics across all merchants</p>
        </div>
      </div>

      <div className={styles.dashboardGrid}>
        {[
          { label: 'Total Merchants', value: merchantCount, icon: Store, color: '#171717', bg: '#f5f5f5' },
          { label: 'Products in IR', value: productCount.toLocaleString(), icon: Package, color: '#10b981', bg: '#ecfdf5' },
          { label: 'Agent Clients', value: agentCount, icon: KeyRound, color: '#f59e0b', bg: '#fffbeb' },
          { label: 'Transaction Events', value: txCount.toLocaleString(), icon: Activity, color: '#8b5cf6', bg: '#f5f3ff' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={styles.metricCard}>
            <div className={styles.iconBadge} style={{ background: bg, color: color }}>
              <Icon size={18} />
            </div>
            <div className={styles.metricValue}>{value}</div>
            <div className={styles.metricLabel}>{label}</div>
          </div>
        ))}
      </div>

      <div className={styles.activityCard}>
        <div className={styles.activityCardHeader}>Recent Merchants</div>
        <ul className={styles.activityList}>
          {merchants.map((m) => (
            <li key={m.id} className={styles.activityItem}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <span className={styles.activityItemTitle}>{m.name}</span>
                  <span className={styles.activityItemSub} style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{m.slug}</span>
                </div>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span>{m._count.products} Products</span>
                  <span>•</span>
                  <span>Joined {m.createdAt.toLocaleDateString()}</span>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>STATUS</div>
                  <span className={m.status === 'ACTIVE' ? styles.statusSuccess : m.status === 'ONBOARDING' ? styles.statusWarning : styles.statusError}>
                    {m.status}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>CIRCUIT</div>
                  <span className={m.syncConfig?.circuitState === 'CLOSED' ? styles.statusSuccess : m.syncConfig?.circuitState === 'OPEN' ? styles.statusError : ''} style={{ fontWeight: 500 }}>
                    {m.syncConfig?.circuitState ?? '—'}
                  </span>
                </div>
                <a href={`/admin/merchants/${m.id}`} style={{ color: 'var(--text-tertiary)' }} title="View Details">
                  <ArrowRight size={18} />
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
