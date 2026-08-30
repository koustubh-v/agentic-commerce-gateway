import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import MerchantSidebar from '@/components/MerchantSidebar';
import styles from './../dashboard.module.css';

export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login');

  return (
    <div className={`dashboard-layout ${styles.dashboardTheme}`} style={{ display: 'flex' }}>
      <MerchantSidebar
        merchantName={session.user.merchantName ?? 'Merchant'}
        email={session.user.email ?? ''}
        role={session.user.role ?? 'merchant'}
      />
      <main style={{ flex: 1, minHeight: '100vh', overflowY: 'auto' }}>{children}</main>
    </div>
  );
}
