'use client';

import { useState } from 'react';
import styles from '@/app/dashboard.module.css';
import { runAgentDemo } from '@/app/actions/demo-agent';
import { Loader2, Bot, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react';

export default function DemoAgentTerminal() {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'blocked'>('idle');
  const [logs, setLogs] = useState<{msg: string, type: 'info'|'success'|'error'}[]>([]);
  const [errorMsg, setErrorMsg] = useState<{ reason: string, rule: string, product?: string, price?: number } | null>(null);

  const suggestions = [
    "Buy some affordable earphones",
    "Buy a smartphone",
    "I need a new laptop",
    "Buy a smartwatch"
  ];

  const addLog = (msg: string, type: 'info'|'success'|'error' = 'info') => setLogs(prev => [...prev, {msg, type}]);

  const executePrompt = async (p: string) => {
    if (!p.trim() || status === 'running') return;

    setPrompt(p);
    setStatus('running');
    setLogs([]);
    setErrorMsg(null);
    
    addLog(`Agent received task: "${p}"`);
    addLog('Extracting purchase intent and keywords...');
    
    await new Promise(r => setTimeout(r, 600));
    addLog('Authenticating securely with Agent Commerce Gateway...');
    
    const result = await runAgentDemo(p);
    
    if (result.success) {
      addLog(`Found product: ${result.productTitle} (₹${result.productPrice})`, 'success');
      addLog('Provisioning Razorpay Secure Checkout...');
      setStatus('success');
      
      setTimeout(() => {
        window.location.href = result.checkoutUrl!;
      }, 1500);
    } else {
      if (result.rule !== 'system' && result.rule !== 'catalog_search') {
        addLog(`Found product: ${result.productTitle} (₹${result.productPrice})`, 'success');
        addLog('Attempting to create order...');
        setStatus('blocked');
        setErrorMsg({ reason: result.reason, rule: result.rule, product: result.productTitle, price: result.productPrice });
      } else {
        setStatus('blocked');
        setErrorMsg({ reason: result.reason, rule: result.rule });
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executePrompt(prompt);
  };

  return (
    <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', width: '100%', maxWidth: '700px', margin: '0 auto', overflow: 'hidden' }}>
      
      {/* Header */}
      <div style={{ background: '#f9fafb', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ background: '#e0e7ff', color: '#4f46e5', width: 36, height: 36, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bot size={20} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#111827', margin: 0 }}>AI Agent Simulator</h2>
          <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: 0 }}>Test how the Gateway processes autonomous purchases</p>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '1.5rem' }}>
        <form onSubmit={handleSubmit} style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#374151', marginBottom: '0.5rem' }}>Purchase Prompt</label>
              <input 
                type="text" 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="E.g. buy some earphones"
                disabled={status === 'running' || status === 'success'}
                style={{ width: '100%', padding: '0.75rem 1rem', background: '#ffffff', border: '1px solid #d1d5db', borderRadius: '8px', color: '#111827', fontSize: '1rem', outline: 'none', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button 
                type="submit" 
                disabled={status === 'running' || status === 'success'}
                className={styles.btnPrimary} 
                style={{ height: '46px', padding: '0 1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: (status === 'running' || status === 'success') ? 0.7 : 1 }}
              >
                {status === 'running' ? <Loader2 className="animate-spin" size={18} /> : <><ArrowRight size={18} /> Execute</>}
              </button>
            </div>
          </div>
        </form>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '2rem' }}>
          {suggestions.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => executePrompt(s)}
              disabled={status === 'running' || status === 'success'}
              style={{ padding: '0.4rem 0.8rem', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '9999px', fontSize: '0.8rem', color: '#4b5563', cursor: (status === 'running' || status === 'success') ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }}
              onMouseOver={(e) => e.currentTarget.style.background = '#e5e7eb'}
              onMouseOut={(e) => e.currentTarget.style.background = '#f3f4f6'}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Status Area */}
        <div style={{ background: '#f3f4f6', borderRadius: '8px', padding: '1.25rem', minHeight: '150px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4b5563', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Execution Log</div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {logs.length === 0 && status === 'idle' && (
              <div style={{ color: '#9ca3af', fontSize: '0.9rem', fontStyle: 'italic' }}>Waiting for prompt...</div>
            )}
            
            {logs.map((log, i) => (
              <div key={i} style={{ color: log.type === 'success' ? '#059669' : '#4b5563', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {log.type === 'info' && <span style={{ color: '#9ca3af' }}>&rarr;</span>}
                {log.type === 'success' && <CheckCircle2 size={14} />}
                {log.msg}
              </div>
            ))}

            {/* Success State */}
            {status === 'success' && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: '8px', color: '#065f46', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <CheckCircle2 size={24} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>GATEWAY APPROVED</div>
                  <div style={{ fontSize: '0.9rem' }}>The transaction satisfies all policies. Redirecting to Razorpay checkout...</div>
                </div>
              </div>
            )}

            {/* Blocked State */}
            {status === 'blocked' && errorMsg && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <AlertTriangle size={24} style={{ marginTop: '0.1rem', flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>GATEWAY BLOCKED TRANSACTION</div>
                  <div style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}><strong>Reason:</strong> {errorMsg.reason}</div>
                  <div style={{ fontSize: '0.9rem' }}><strong>Rule Enforced:</strong> <code style={{ background: '#fecaca', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>{errorMsg.rule}</code></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
