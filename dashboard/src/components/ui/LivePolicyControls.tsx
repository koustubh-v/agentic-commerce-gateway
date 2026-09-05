'use client';

import { useState, useEffect } from 'react';
import { Settings, ShieldAlert, Zap, Loader2 } from 'lucide-react';
import { getMerchantPolicy, updateMerchantPolicy } from '@/app/actions/policy';

export default function LivePolicyControls() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [policy, setPolicy] = useState({
    perTransactionCapINR: 10000,
    perSessionCapINR: 50000,
  });

  useEffect(() => {
    getMerchantPolicy().then(data => {
      if (data) {
        setPolicy({
          perTransactionCapINR: data.perTransactionCapINR,
          perSessionCapINR: data.perSessionCapINR,
        });
      }
      setLoading(false);
    });
  }, []);

  const handleUpdate = async (field: string, value: number) => {
    const newPolicy = { ...policy, [field]: value };
    setPolicy(newPolicy);
    
    setSaving(true);
    await updateMerchantPolicy({ [field]: value });
    setTimeout(() => setSaving(false), 500); // Artificial delay for UX
  };

  if (loading) {
    return <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '2rem', display: 'flex', justifyContent: 'center' }}><Loader2 className="animate-spin" size={24} color="#3b82f6" /></div>;
  }

  return (
    <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', overflow: 'hidden' }}>
      <div style={{ background: '#f8fafc', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ background: '#fee2e2', color: '#ef4444', width: 36, height: 36, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldAlert size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>Live Policy Controls</h2>
            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>Update rules in real-time</p>
          </div>
        </div>
        {saving ? (
          <span style={{ fontSize: '0.8rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}><Loader2 size={14} className="animate-spin" /> Saving...</span>
        ) : (
          <span style={{ fontSize: '0.8rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}><Zap size={14} /> Active</span>
        )}
      </div>

      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>Per-Transaction Cap</label>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
              ₹{policy.perTransactionCapINR.toLocaleString()}
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem', lineHeight: 1.5 }}>
            Blocks any single transaction exceeding this amount. To test it, set it to ₹10,000 and try to buy the smartphone!
          </p>
          <input 
            type="range" 
            min="1000" 
            max="50000" 
            step="1000"
            value={policy.perTransactionCapINR}
            onChange={(e) => setPolicy({ ...policy, perTransactionCapINR: parseInt(e.target.value) })}
            onMouseUp={(e) => handleUpdate('perTransactionCapINR', parseInt(e.currentTarget.value))}
            onTouchEnd={(e) => handleUpdate('perTransactionCapINR', parseInt(e.currentTarget.value))}
            style={{ width: '100%', accentColor: '#3b82f6' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>
            <span>₹1K</span>
            <span>₹50K</span>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>Session Budget Cap</label>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
              ₹{policy.perSessionCapINR.toLocaleString()}
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem', lineHeight: 1.5 }}>
            The total allowed spend for a single agent session before it requires human step-up authentication.
          </p>
          <input 
            type="range" 
            min="5000" 
            max="100000" 
            step="5000"
            value={policy.perSessionCapINR}
            onChange={(e) => setPolicy({ ...policy, perSessionCapINR: parseInt(e.target.value) })}
            onMouseUp={(e) => handleUpdate('perSessionCapINR', parseInt(e.currentTarget.value))}
            onTouchEnd={(e) => handleUpdate('perSessionCapINR', parseInt(e.currentTarget.value))}
            style={{ width: '100%', accentColor: '#3b82f6' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>
            <span>₹5K</span>
            <span>₹100K</span>
          </div>
        </div>

      </div>
    </div>
  );
}
