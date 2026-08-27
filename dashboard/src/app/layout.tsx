import './globals.css';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import { LayoutDashboard, Database, Activity, KeyRound, Settings } from 'lucide-react';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'ACG Merchant Dashboard',
  description: 'Manage Agent Commerce Gateway',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="dashboard-layout">
          {/* Sidebar */}
          <aside className="sidebar">
            <div className="sidebar-header">
              <Activity size={24} color="#3384f5" />
              <span>ACG Dashboard</span>
            </div>
            
            <nav className="sidebar-nav">
              <Link href="/" className="nav-link">
                <LayoutDashboard size={18} /> Overview
              </Link>
              <Link href="/catalog" className="nav-link">
                <Database size={18} /> Catalog Sync
              </Link>
              <Link href="/audit" className="nav-link">
                <Activity size={18} /> Audit Log
              </Link>
              <Link href="/agents" className="nav-link">
                <KeyRound size={18} /> Agent Clients
              </Link>
              <Link href="/settings" className="nav-link">
                <Settings size={18} /> Settings
              </Link>
            </nav>
          </aside>

          {/* Main Content */}
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
