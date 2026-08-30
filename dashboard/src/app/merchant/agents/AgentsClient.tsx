'use client';

import { useState } from 'react';
import { Copy, Plus, Check } from 'lucide-react';
import styles from '@/app/dashboard.module.css';

interface AgentClient {
  id: string;
  name: string;
  clientId: string;
  scopes: string[];
  revoked: boolean;
  createdAt: Date;
}

interface NewClientData {
  clientId: string;
  clientSecret: string;
  name: string;
}

export default function AgentsClient({ clients: initialClients }: { clients: AgentClient[] }) {
  const [clients, setClients] = useState(initialClients);
  const [creating, setCreating] = useState(false);
  const [newClient, setNewClient] = useState<NewClientData | null>(null);
  const [copied, setCopied] = useState('');
  const [clientName, setClientName] = useState('');

  async function createClient() {
    setCreating(true);
    const res = await fetch('/api/merchant/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: clientName || 'Agent Client' }),
    });
    const data = await res.json();
    if (res.ok) {
      setNewClient(data);
      setClients(prev => [data.client, ...prev]);
    }
    setCreating(false);
    setClientName('');
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  }

  return (
    <div>
      {}
      <div className={styles.formSection} style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '1rem', fontSize: '0.9rem' }}>Create New Agent Client</div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <input type="text" className={styles.formInput} value={clientName}
            onChange={e => setClientName(e.target.value)}
            placeholder="e.g. Shopping Bot v1" style={{ maxWidth: '320px' }} />
          <button className={styles.btnPrimary} onClick={createClient} disabled={creating}>
            <Plus size={15} /> {creating ? 'Creating...' : 'Create Client'}
          </button>
        </div>
      </div>

      {}
      {newClient && (
        <div style={{
          padding: '1.25rem', borderRadius: '12px', marginBottom: '1.5rem',
          background: '#ecfdf5', border: '1px solid #10b981',
        }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#047857', marginBottom: '1rem' }}>
            Client created. Copy your secret now — it will not be shown again.
          </div>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {[
              { label: 'Client ID', value: newClient.clientId, key: 'cid' },
              { label: 'Client Secret', value: newClient.clientSecret, key: 'cs' },
            ].map(({ label, value, key }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#ffffff', border: '1px solid #d1fae5', padding: '0.625rem 0.875rem', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: '#047857', width: '90px', flexShrink: 0, fontWeight: 500 }}>{label}</span>
                <code style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</code>
                <button onClick={() => copyText(value, key)} className={styles.btnSecondary} style={{ flexShrink: 0, padding: '0.35rem' }}>
                  {copied === key ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                </button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#047857' }}>
            Use these with the ACG OAuth2 endpoint: <code style={{ fontFamily: 'monospace' }}>POST /acp/oauth/token</code>
          </div>
        </div>
      )}

      {}
      <div className={styles.activityCard}>
        <div className={styles.activityCardHeader}>Agent Clients</div>
        <ul className={styles.activityList}>
          {clients.length === 0 && (
            <li className={styles.activityItem} style={{ justifyContent: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
              No agent clients yet.
            </li>
          )}
          {clients.map((c) => (
            <li key={c.id} className={styles.activityItem}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem', gap: '0.5rem' }}>
                  <span className={styles.activityItemTitle}>{c.name}</span>
                  <span className={c.revoked ? styles.statusError : styles.statusSuccess} style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#f4f4f5', borderRadius: '4px' }}>
                    {c.revoked ? 'REVOKED' : 'ACTIVE'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <code style={{ fontFamily: 'monospace' }}>{c.clientId}</code>
                  <span>•</span>
                  <span>Created {new Date(c.createdAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '2.5rem', alignItems: 'center' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>SCOPES</div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {c.scopes.map(s => <span key={s} style={{ fontSize: '0.68rem', padding: '2px 6px', background: '#f4f4f5', borderRadius: '4px', border: '1px solid var(--border-color)' }}>{s}</span>)}
                  </div>
                </div>
                <button onClick={() => copyText(c.clientId, c.id)} className={styles.btnSecondary} style={{ padding: '0.35rem 0.75rem' }}>
                  {copied === c.id ? <Check size={14} color="#10b981" /> : <Copy size={14} />} Copy ID
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
