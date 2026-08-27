import { prisma } from '@/lib/prisma';
import { Activity, Database, KeyRound, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default async function OverviewPage() {
  const [merchants, agents, events, latestSync] = await Promise.all([
    prisma.merchant.count(),
    prisma.agentClient.count(),
    prisma.transactionEvent.count(),
    prisma.syncRun.findFirst({ orderBy: { startedAt: 'desc' } })
  ]);

  return (
    <div>
      <div className="card-title" style={{ borderBottom: 'none', marginBottom: '1.5rem', fontSize: '1.5rem' }}>
        <h2>System Overview</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Active Merchants</h3>
            <Database size={20} color="var(--text-secondary)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 600, marginTop: '1rem' }}>{merchants}</div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Active Agents</h3>
            <KeyRound size={20} color="var(--text-secondary)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 600, marginTop: '1rem' }}>{agents}</div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Transactions</h3>
            <Activity size={20} color="var(--text-secondary)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 600, marginTop: '1rem' }}>{events}</div>
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Ingestion Health</h3>
            <CheckCircle size={20} color={latestSync?.status === 'SUCCESS' ? '#137333' : 'var(--text-secondary)'} />
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, marginTop: '1rem', color: latestSync?.status === 'SUCCESS' ? '#137333' : 'inherit' }}>
            {latestSync ? latestSync.status : 'NO RUNS'}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Quick Actions</div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link href="/catalog" className="btn btn-primary">
            Configure Catalog Sync
          </Link>
          <Link href="/agents" className="btn btn-outline">
            Create Agent Client
          </Link>
        </div>
      </div>
    </div>
  );
}
