import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function MerchantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const merchant = await prisma.merchant.findUnique({
    where: { id },
    include: {
      syncConfig: true,
      _count: { select: { products: true, orders: true, carts: true } },
    },
  });

  if (!merchant) notFound();

  const [recentProducts, recentSyncs, recentOrders] = await Promise.all([
    prisma.product.findMany({ where: { merchantId: id }, take: 5, orderBy: { updatedAt: 'desc' } }),
    prisma.syncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 5 }),
    prisma.order.findMany({ where: { merchantId: id }, take: 5, orderBy: { createdAt: 'desc' } }),
  ]);

  return (
    <div>
      <div className="page-header flex items-center gap-2">
        <Link href="/admin/merchants" className="btn btn-ghost btn-sm">← Back</Link>
        <div>
          <h1 className="page-title">{merchant.name}</h1>
          <p className="page-subtitle mono" style={{ fontFamily: 'var(--font-mono)' }}>{merchant.id}</p>
        </div>
      </div>

      {}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card">
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>Merchant Info</div>
          {[
            { label: 'Name', value: merchant.name },
            { label: 'Email', value: merchant.email },
            { label: 'Status', value: merchant.status },
            { label: 'Currency', value: merchant.currency },
            { label: 'API Key Prefix', value: merchant.apiKeyPrefix, mono: true },
            { label: 'Created', value: merchant.createdAt.toLocaleString() },
          ].map(({ label, value, mono }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
              <span style={{ fontFamily: mono ? 'var(--font-mono)' : undefined, color: 'var(--text-primary)', maxWidth: '60%', textAlign: 'right' }}>{value}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>Sync Config</div>
          {merchant.syncConfig ? (
            <>
              {[
                { label: 'Endpoint', value: merchant.syncConfig.productsEndpoint || '—', mono: true },
                { label: 'Circuit State', value: merchant.syncConfig.circuitState },
                { label: 'Failures', value: String(merchant.syncConfig.consecutiveFailures) },
                { label: 'Poll Interval', value: `${merchant.syncConfig.pollIntervalMs / 60000} min` },
                { label: 'Active', value: merchant.syncConfig.active ? 'Yes' : 'No' },
              ].map(({ label, value, mono }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.82rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontFamily: mono ? 'var(--font-mono)' : undefined, color: 'var(--text-primary)', maxWidth: '60%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
                </div>
              ))}
            </>
          ) : (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>No sync config. Store not connected.</p>
          )}
        </div>
      </div>

      {}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Products', value: merchant._count.products },
          { label: 'Orders', value: merchant._count.orders },
          { label: 'Carts', value: merchant._count.carts },
        ].map(({ label, value }) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>

      {}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>Recent Products</div>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Title</th><th>Price</th><th>Availability</th><th>Synced</th></tr></thead>
            <tbody>
              {recentProducts.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '1.5rem' }}>No products yet.</td></tr>
              )}
              {recentProducts.map(p => (
                <tr key={p.id}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{p.title}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{p.currency} {Number(p.price).toLocaleString()}</td>
                  <td><span className={`badge badge-dot ${p.availability === 'IN_STOCK' ? 'badge-success' : 'badge-error'}`}>{p.availability}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{p.lastSyncedAt?.toLocaleString() ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {}
      <div className="card">
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>Recent Sync Runs</div>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Started</th><th>Status</th><th>Fetched</th><th>Upserted</th><th>Failed</th></tr></thead>
            <tbody>
              {recentSyncs.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '1.5rem' }}>No sync runs yet.</td></tr>
              )}
              {recentSyncs.map(s => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{s.startedAt.toLocaleString()}</td>
                  <td>
                    <span className={`badge badge-dot ${s.status === 'SUCCESS' ? 'badge-success' : s.status === 'FAILED' ? 'badge-error' : s.status === 'PARTIAL' ? 'badge-warning' : 'badge-info'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{s.itemsFetched}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{s.itemsUpserted}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', color: s.itemsFailed > 0 ? 'var(--error)' : 'var(--text-tertiary)' }}>{s.itemsFailed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
