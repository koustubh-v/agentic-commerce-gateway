import DemoAgentTerminal from '@/components/ui/DemoAgentTerminal';
import LivePolicyControls from '@/components/ui/LivePolicyControls';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Demo Agent | Agent Commerce Gateway'
};

export default function DemoPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '1rem 2rem', display: 'flex', alignItems: 'center' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: '#4b5563', fontSize: '0.9rem', fontWeight: 500 }}>
          <ArrowLeft size={16} /> Back to Home
        </Link>
      </header>

      <main style={{ flex: 1, padding: '4rem 2rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: '350px 1fr', gap: '3rem', alignItems: 'flex-start' }}>
          
          <div style={{ position: 'sticky', top: '2rem' }}>
            <LivePolicyControls />
          </div>

          <div>
            <DemoAgentTerminal />
          </div>

        </div>
      </main>
    </div>
  );
}
