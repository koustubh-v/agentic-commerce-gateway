import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import styles from '@/app/dashboard.module.css';

export default async function AllMerchantsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = params.search || '';
  const page = parseInt(params.page || '1');
  const limit = 20;

  const [merchants, total] = await Promise.all([
    prisma.merchant.findMany({
      where: search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { slug: { contains: search, mode: 'insensitive' } },
        ],
      } : {},
      include: {
        _count: { select: { products: true, orders: true } },
        syncConfig: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.merchant.count({ where: search ? { name: { contains: search, mode: 'insensitive' } } : {} }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>All Merchants</h1>
          <p className={styles.pageSubtitle}>{total} registered merchants</p>
        </div>
        <Link href="/admin/merchants/new" className={styles.btnPrimary}>+ Add Merchant</Link>
      </div>

      {}
      <div className={styles.formSection} style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <form method="GET" style={{ display: 'flex', gap: '0.75rem' }}>
          <input name="search" defaultValue={search} className={styles.formInput} placeholder="Search by name, email, or slug..." style={{ flex: 1 }} />
          <button type="submit" className={styles.btnPrimary}>Search</button>
          {search && <a href="/admin/merchants" className={styles.btnSecondary}>Clear</a>}
        </form>
      </div>

      <div className={styles.activityCard}>
        <div className={styles.activityCardHeader}>Merchants Directory</div>
        <ul className={styles.activityList}>
          {merchants.length === 0 && (
            <li className={styles.activityItem} style={{ justifyContent: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
              No merchants found.
            </li>
          )}
          {merchants.map((m) => (
            <li key={m.id} className={styles.activityItem}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem', gap: '0.5rem' }}>
                  <span className={styles.activityItemTitle}>{m.name}</span>
                  <span className={m.status === 'ACTIVE' ? styles.statusSuccess : m.status === 'ONBOARDING' ? styles.statusWarning : styles.statusError} style={{ fontSize: '0.75rem', padding: '2px 6px', background: '#f4f4f5', borderRadius: '4px' }}>
                    {m.status}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span style={{ fontFamily: 'monospace' }}>{m.slug}</span>
                  <span>•</span>
                  <span>{m.email}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'center' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>PRODUCTS</div>
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{m._count.products}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>CIRCUIT</div>
                  <span className={m.syncConfig?.circuitState === 'CLOSED' ? styles.statusSuccess : m.syncConfig?.circuitState === 'OPEN' ? styles.statusError : ''} style={{ fontWeight: 500 }}>
                    {m.syncConfig?.circuitState ?? '—'}
                  </span>
                </div>
                <a href={`/admin/merchants/${m.id}`} className={styles.btnSecondary} style={{ padding: '0.35rem 0.75rem' }}>View →</a>
              </div>
            </li>
          ))}
        </ul>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Page {page} of {totalPages}</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {page > 1 && <a href={`?page=${page - 1}&search=${search}`} className={styles.btnSecondary}>← Prev</a>}
              {page < totalPages && <a href={`?page=${page + 1}&search=${search}`} className={styles.btnSecondary}>Next →</a>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
