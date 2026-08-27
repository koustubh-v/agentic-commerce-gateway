import { prisma } from '@/lib/prisma';
import { formatDistanceToNow } from 'date-fns'; // Need to install date-fns

export default async function AuditPage() {
  const events = await prisma.transactionEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      paymentIntent: true,
      order: true,
    }
  });

  return (
    <div>
      <div className="card-title" style={{ borderBottom: 'none', marginBottom: '1.5rem', fontSize: '1.5rem' }}>
        <h2>Transaction Ledger</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 400, marginTop: '0.25rem' }}>
          Immutable audit trail of all agent interactions.
        </p>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Event Type</th>
                <th>Payment Intent</th>
                <th>Amount</th>
                <th>Actor</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No transactions found.
                  </td>
                </tr>
              )}
              {events.map((event) => (
                <tr key={event.id}>
                  <td>
                    <span className={`badge ${
                      event.eventType.includes('FAILED') || event.eventType.includes('REJECTED') ? 'badge-error' :
                      event.eventType.includes('SUCCESS') || event.eventType.includes('APPROVED') ? 'badge-success' : 'badge-neutral'
                    }`}>
                      {event.eventType}
                    </span>
                  </td>
                  <td>
                    <span className="mono">{event.paymentIntentId.slice(0, 13)}...</span>
                  </td>
                  <td>
                    {event.paymentIntent.amount.toString()} {event.paymentIntent.currency}
                  </td>
                  <td>
                    {event.actor.startsWith('agent:') ? (
                      <span className="mono" style={{ color: '#000' }}>{event.actor}</span>
                    ) : (
                      event.actor
                    )}
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {event.createdAt.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
