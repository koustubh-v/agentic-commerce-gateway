'use client';

import { useEffect } from 'react';
import styles from '@/app/dashboard.module.css';
import { markCheckoutComplete } from './actions';

interface CheckoutProps {
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  keyId: string;
  token: string;
}

export default function CheckoutClient({ orderId, amount, currency, name, keyId, token }: CheckoutProps) {
  useEffect(() => {
    // Load Razorpay script
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); }
  }, []);

  const handlePayment = () => {
    const options = {
      key: keyId,
      amount: amount.toString(),
      currency: currency,
      name: name,
      description: 'Agent Commerce Gateway Order',
      order_id: orderId,
      handler: async function (response: any) {
        // Simulate the Razorpay webhook reaching our Gateway via Server Action
        await markCheckoutComplete(token, response.razorpay_payment_id);
        
        alert(`Payment successful! Payment ID: ${response.razorpay_payment_id}`);
        // Redirect to success page or dashboard
        window.location.href = '/merchant/dashboard';
      },
      theme: {
        color: '#10b981'
      }
    };
    
    // @ts-ignore
    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  return (
    <button 
      className={styles.btnPrimary} 
      style={{ width: '100%', marginTop: '1rem', padding: '0.75rem', fontSize: '1rem' }}
      onClick={handlePayment}
    >
      Pay Now with Razorpay
    </button>
  );
}
