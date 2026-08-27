import { prisma } from '@/lib/prisma';
import { KeyRound, Plus } from 'lucide-react';
import { createAgentClient } from './actions';

export default async function AgentsPage() {
  const clients = await prisma.agentClient.findMany({
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div>
      <div className="card-title" style={{ borderBottom: 'none', marginBottom: '1.5rem', fontSize: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Agent Clients</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 400, marginTop: '0.25rem' }}>
            OAuth2 credentials for autonomous agents.
          </p>
        </div>
        <form action={async () => {
          'use server';
          await createAgentClient();
        }}>
          <button type="submit" className="btn btn-primary">
            <Plus size={16} /> New Client
          </button>
        </form>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Client ID</th>
                <th>Scopes</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No Agent Clients found.
                  </td>
                </tr>
              )}
              {clients.map((client) => (
                <tr key={client.id}>
                  <td style={{ fontWeight: 500 }}>{client.name}</td>
                  <td><span className="mono">{client.clientId}</span></td>
                  <td>
                    {client.scopes.map(s => (
                      <span key={s} className="badge badge-neutral" style={{ marginRight: '0.5rem' }}>{s}</span>
                    ))}
                  </td>
                  <td>
                    <span className={`badge ${client.revoked ? 'badge-error' : 'badge-success'}`}>
                      {client.revoked ? 'REVOKED' : 'ACTIVE'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{client.createdAt.toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
