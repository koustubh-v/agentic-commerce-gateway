import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import styles from '@/app/dashboard.module.css';

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.merchantId) redirect('/login');

  const params = await searchParams;
  const search = params.search || '';
  const page = parseInt(params.page || '1');
  const limit = 20;

  const merchantId = session.user.merchantId!;

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where: {
        merchantId,
        ...(search ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { category: { contains: search, mode: 'insensitive' } },
          ],
        } : {}),
      },
      include: { variants: true },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.product.count({ where: { merchantId } }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Catalog</h1>
          <p className={styles.pageSubtitle}>{total} products synced from your store</p>
        </div>
      </div>

      {}
      <div className={styles.formSection} style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <form method="GET" style={{ display: 'flex', gap: '0.75rem' }}>
          <input name="search" defaultValue={search} className={styles.formInput} placeholder="Search by title or category..." style={{ flex: 1 }} />
          <button type="submit" className={styles.btnPrimary}>Search</button>
          {search && <a href="/merchant/catalog" className={styles.btnSecondary}>Clear</a>}
        </form>
      </div>

      <div className={styles.activityCard}>
        <div className={styles.activityCardHeader}>Products</div>
        <ul className={styles.activityList}>
          {products.length === 0 && (
            <li className={styles.activityItem} style={{ justifyContent: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
              {search ? 'No products match your search.' : 'No products synced yet. Connect your store to start.'}
            </li>
          )}
          {products.map((p) => {
            const images = Array.isArray(p.images) ? p.images as any[] : [];
            return (
              <li key={p.id} className={styles.activityItem}>
                <div style={{ flex: 1, display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  {images[0]?.url ? (
                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden', flexShrink: 0 }}>
                      <img src={images[0].url} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ) : (
                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#f9fafb', flexShrink: 0 }} />
                  )}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem', gap: '0.5rem' }}>
                      <span className={styles.activityItemTitle}>{p.title}</span>
                      <span className={p.availability === 'IN_STOCK' ? styles.statusSuccess : p.availability === 'OUT_OF_STOCK' ? styles.statusError : styles.statusWarning} style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#f4f4f5', borderRadius: '4px' }}>
                        {p.availability.replace('_', ' ')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <span style={{ fontFamily: 'monospace' }}>{p.externalId}</span>
                      <span>•</span>
                      <span>{p.category || 'No Category'}</span>
                      <span>•</span>
                      <span>{p.variants.length} Variants</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'center' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>PRICE</div>
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{p.currency} {Number(p.price).toLocaleString('en-IN')}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>SYNCED</div>
                    <span style={{ color: 'var(--text-secondary)' }}>{p.lastSyncedAt ? p.lastSyncedAt.toLocaleDateString() : '—'}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
              Page {page} of {totalPages}
            </span>
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
