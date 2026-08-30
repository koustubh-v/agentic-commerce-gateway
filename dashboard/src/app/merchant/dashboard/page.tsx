import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Tooltip from '@/components/ui/Tooltip';
import styles from '@/app/dashboard.module.css';
import { IndianRupee, Users, Activity, Package } from 'lucide-react';

export default async function MerchantDashboard() {
  const session = await auth();
  if (!session?.user?.merchantId) {
    return <div>Unauthorized</div>;
  }

  const merchantId = session.user.merchantId!;

  const [productCount, txCount, agentCount, revenueAgg] = await Promise.all([
    prisma.product.count({ where: { merchantId } }),
    prisma.transactionEvent.count({ where: { paymentIntent: { merchantId } } }),
    prisma.agentClient.count(),
    prisma.paymentIntent.aggregate({
      where: { merchantId, status: 'PSP_SUCCEEDED' },
      _sum: { amount: true }
    })
  ]);

  const totalRevenue = Number(revenueAgg._sum.amount || 0) / 100; 

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Welcome back, {session.user.name || 'Merchant'}</h1>
          <p className={styles.pageSubtitle}>Here is what's happening with your autonomous agents today.</p>
        </div>
      </div>

      <div className={styles.dashboardGrid}>
        <div className={styles.metricCard}>
          <div className={styles.iconBadge} style={{ background: '#f5f5f5', color: '#171717' }}>
            <IndianRupee size={18} />
          </div>
          <div className={styles.metricValue}>₹{totalRevenue.toLocaleString()}</div>
          <div className={styles.metricLabel}>
            Total Revenue
            <Tooltip content="Total revenue generated exclusively by autonomous AI agents." />
          </div>
        </div>
        
        <div className={styles.metricCard}>
          <div className={styles.iconBadge} style={{ background: '#fffbeb', color: '#f59e0b' }}>
            <Users size={18} />
          </div>
          <div className={styles.metricValue}>{agentCount}</div>
          <div className={styles.metricLabel}>
            Agent Clients
            <Tooltip content="Number of registered agent clients authorized to transact." />
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.iconBadge} style={{ background: '#f5f3ff', color: '#8b5cf6' }}>
            <Activity size={18} />
          </div>
          <div className={styles.metricValue}>{txCount}</div>
          <div className={styles.metricLabel}>
            Total Transactions
            <Tooltip content="Total successful transactions processed via ACG." />
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.iconBadge} style={{ background: '#ecfdf5', color: '#10b981' }}>
            <Package size={18} />
          </div>
          <div className={styles.metricValue}>{productCount}</div>
          <div className={styles.metricLabel}>
            Products Synced
            <Tooltip content="Number of products successfully synced from your store API." />
          </div>
        </div>
      </div>

      <div className={styles.activityCard}>
        <div className={styles.activityCardHeader}>Recent Activity</div>
        <ul className={styles.activityList}>
          <li className={styles.activityItem}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span className={styles.activityItemTitle}>Dashboard Updated</span>
                <span className={styles.activityItemSub}>Real-time data connection established</span>
              </div>
            </div>
            <span className={styles.statusSuccess}>Active</span>
          </li>
          <li className={styles.activityItem}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span className={styles.activityItemTitle}>Catalog Sync</span>
                <span className={styles.activityItemSub}>Tracking {productCount} items from your store</span>
              </div>
            </div>
            <span className={styles.statusSuccess}>Success</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
