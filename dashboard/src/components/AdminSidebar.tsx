'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LayoutDashboard, Store, UserPlus, LogOut, Shield, Home } from 'lucide-react';
import styles from '@/app/dashboard.module.css';

const adminNav = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/merchants', label: 'All Merchants', icon: Store },
  { href: '/admin/merchants/new', label: 'Add Merchant', icon: UserPlus },
];

export default function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarLogo}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '6px', flexShrink: 0,
          background: '#171717',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white'
        }}>
          <Shield size={14} />
        </div>
        <div>
          <div className={styles.sidebarLogoText}>ACG Admin</div>
          <div className={styles.sidebarLogoSub}>Super Admin Panel</div>
        </div>
      </div>

      <nav className={styles.sidebarNav}>
        <div className={styles.navSectionLabel}>Administration</div>
        {adminNav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== '/admin/dashboard' && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}
              className={`${styles.navLink} ${active ? styles.active : ''}`}>
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className={styles.sidebarFooter}>
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{
            display: 'inline-block',
            padding: '2px 8px',
            background: '#fee2e2',
            color: '#dc2626',
            borderRadius: '9999px',
            fontSize: '0.7rem',
            fontWeight: 600,
            marginBottom: '0.5rem'
          }}>ADMIN</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{email}</div>
        </div>
        <button onClick={() => signOut({ callbackUrl: '/login' })}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '0.8rem', padding: 0, fontFamily: 'var(--font-sans)' }}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  );
}
