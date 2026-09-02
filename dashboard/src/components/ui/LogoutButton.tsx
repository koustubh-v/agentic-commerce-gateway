'use client';
import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { User, LogOut } from 'lucide-react';

export default function LogoutButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{ 
          background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255,255,255,0.1)', 
          cursor: 'pointer', color: 'white', borderRadius: '50%', width: '36px', height: '36px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s'
        }}
      >
        <User size={18} />
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '120%', right: '0', 
          background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', 
          borderRadius: '8px', padding: '0.5rem', minWidth: '150px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)', zIndex: 100
        }}>
          <button 
            onClick={() => signOut()} 
            style={{ 
              background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.5rem',
              width: '100%', padding: '0.5rem', textAlign: 'left', fontSize: '0.875rem'
            }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
