import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import styles from '@/app/dashboard.module.css';

const EVENT_COLORS: Record<string, string> = {
  INTENT_CREATED: 'badge-info',
  GATE_DECISION: 'badge-neutral',
  PSP_INITIATED: 'badge-info',
  PSP_SUCCEEDED: 'badge-success',
  PSP_FAILED: 'badge-error',
  FULFILLMENT_TRIGGERED: 'badge-success',
  FULFILLED: 'badge-success',
  FAILED: 'badge-error',
  REFUNDED: 'badge-warning',
  CANCELLED: 'badge-warning',
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.merchantId) redirect('/login');

  const params = await searchParams;
  const page = parseInt(params.page || '1');
  const limit = 30;
  const merchantId = session.user.merchantId!;

  const [events, total] = await Promise.all([
    prisma.transactionEvent.findMany({
      where: { paymentIntent: { merchantId } },
      include: { paymentIntent: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.transactionEvent.count({ where: { paymentIntent: { merchantId } } }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Audit Log</h1>
          <p className={styles.pageSubtitle}>Immutable append-only record of every transaction event</p>
        </div>
      </div>

      <div className={styles.activityCard}>
        <div className={styles.activityCardHeader}>Transactions</div>
        <ul className={styles.activityList}>
          {events.length === 0 && (
            <li className={styles.activityItem} style={{ justifyContent: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
              No transactions yet.
            </li>
          )}
          {events.map((e) => (
            <li key={e.id} className={styles.activityItem}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem', gap: '0.75rem' }}>
                  <span className={styles.activityItemTitle}>{e.eventType.replace(/_/g, ' ')}</span>
                  <span style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#f4f4f5', borderRadius: '4px', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                    {e.actor}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <code style={{ fontFamily: 'monospace' }}>Intent: {e.paymentIntentId.slice(0, 14)}…</code>
                  <span>•</span>
                  <code style={{ fontFamily: 'monospace' }}>Tx: {e.correlationId.slice(0, 10)}…</code>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'center' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>AMOUNT</div>
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{e.paymentIntent.currency} {Number(e.paymentIntent.amount).toLocaleString('en-IN')}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>TIMESTAMP</div>
                  <span style={{ color: 'var(--text-secondary)' }}>{e.createdAt.toLocaleString()}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{total} total events — Page {page} of {totalPages}</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {page > 1 && <a href={`?page=${page - 1}`} className={styles.btnSecondary}>← Prev</a>}
              {page < totalPages && <a href={`?page=${page + 1}`} className={styles.btnSecondary}>Next →</a>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
