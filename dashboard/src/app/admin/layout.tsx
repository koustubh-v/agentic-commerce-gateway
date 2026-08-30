import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AdminSidebar from '@/components/AdminSidebar';
import styles from './../dashboard.module.css';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user?.role !== 'admin') redirect('/merchant/dashboard');

  return (
    <div className={`dashboard-layout ${styles.dashboardTheme}`} style={{ display: 'flex' }}>
      <AdminSidebar email={session.user.email ?? ''} />
      <main style={{ flex: 1, minHeight: '100vh', overflowY: 'auto' }}>{children}</main>
    </div>
  );
}
