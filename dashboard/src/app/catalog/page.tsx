import { prisma } from '@/lib/prisma';
import { triggerSync } from './actions';

export default async function CatalogPage() {
  const configs = await prisma.merchantSyncConfig.findMany({
    include: {
      merchant: true,
    }
  });

  return (
    <div>
      <div className="card-title" style={{ borderBottom: 'none', marginBottom: '1.5rem', fontSize: '1.5rem' }}>
        <h2>Catalog Connection</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 400, marginTop: '0.25rem' }}>
          Configure JSONPath maps and trigger Mode A sync runs.
        </p>
      </div>

      {configs.map((config) => (
        <div key={config.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{config.merchant.name}</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <span className="mono">{config.productsEndpoint}</span>
              </p>
            </div>
            <div>
              <span className={`badge ${
                config.circuitState === 'CLOSED' ? 'badge-success' :
                config.circuitState === 'OPEN' ? 'badge-error' : 'badge-pending'
              }`}>
                Breaker: {config.circuitState}
              </span>
            </div>
          </div>

          <div className="form-group" style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '4px' }}>
            <label className="form-label">Field Map (JSONPath)</label>
            <pre className="mono" style={{ margin: 0, overflowX: 'auto', backgroundColor: 'transparent' }}>
              {JSON.stringify(config.fieldMap, null, 2)}
            </pre>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <form action={async () => {
              'use server';
              await triggerSync(config.merchantId);
            }}>
              <button type="submit" className="btn btn-primary">
                Trigger Manual Sync
              </button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
