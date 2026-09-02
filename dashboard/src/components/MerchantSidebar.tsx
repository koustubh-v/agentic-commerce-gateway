'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard, Link2, Package, KeyRound,
  Activity, Settings, LogOut, Shield, BookOpen, Home
} from 'lucide-react';
import styles from '@/app/dashboard.module.css';

const merchantNav = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/merchant/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/merchant/connect', label: 'Connect Store', icon: Link2 },
  { href: '/merchant/docs', label: 'Developer Docs', icon: BookOpen },
  { href: '/merchant/catalog', label: 'Catalog', icon: Package },
  { href: '/merchant/agents', label: 'Agent Clients', icon: KeyRound },
  { href: '/merchant/audit', label: 'Audit Log', icon: Activity },
  { href: '/merchant/settings', label: 'Settings', icon: Settings },
];

interface Props {
  merchantName: string;
  email: string;
  role: string;
}

export default function MerchantSidebar({ merchantName, email, role }: Props) {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      {}
      <div className={styles.sidebarLogo}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '6px', flexShrink: 0,
          background: '#171717',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, color: 'white', fontSize: '0.8rem',
        }}>A</div>
        <div>
          <div className={styles.sidebarLogoText}>ACG</div>
          <div className={styles.sidebarLogoSub}>Agent Commerce Gateway</div>
        </div>
      </div>

      {}
      <nav className={styles.sidebarNav}>
        <div className={styles.navSectionLabel}>Merchant</div>
        {merchantNav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href}
              className={`${styles.navLink} ${active ? styles.active : ''}`}>
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}

        {role === 'admin' && (
          <>
            <div className={styles.navSectionLabel} style={{ marginTop: '1.5rem' }}>Admin</div>
            <Link href="/admin/dashboard"
              className={`${styles.navLink} ${pathname.startsWith('/admin') ? styles.active : ''}`}>
              <Shield size={16} />
              Admin Panel
            </Link>
          </>
        )}
      </nav>

      {}
      <div className={styles.sidebarFooter}>
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.15rem' }}>
            {merchantName}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {email}
          </div>
        </div>
        <button onClick={() => signOut({ callbackUrl: '/login' })}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-tertiary)', fontSize: '0.8rem', padding: 0,
            fontFamily: 'var(--font-sans)',
          }}>
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  );
}
