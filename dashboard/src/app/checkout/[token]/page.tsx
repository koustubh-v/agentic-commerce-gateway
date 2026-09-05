import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import CheckoutClient from './CheckoutClient';
import styles from '@/app/page.module.css';

export default async function CheckoutPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const intent = await prisma.paymentIntent.findFirst({
    where: { checkoutToken: token },
    include: { merchant: true, order: { include: { cart: { include: { items: true } } } } }
  });

  if (!intent) {
    return notFound();
  }

  // Get razorpay key (fallback to env, and finally to hardcoded test key if env is missing)
  const keyId = intent.merchant.razorpayKeyId || process.env.RAZORPAY_KEY_ID || 'rzp_test_TU6VuTMFVnMb7P';

  return (
    <div className={styles.page} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
      <div style={{ background: '#fff', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', maxWidth: '400px', width: '100%' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', fontWeight: 600 }}>Checkout Summary</h2>
        <div style={{ marginBottom: '1.5rem' }}>
          {intent.order.cart.items.map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span>{item.productTitle} x{item.quantity}</span>
              <span>₹{Number(item.lineTotal).toLocaleString()}</span>
            </div>
          ))}
          <hr style={{ margin: '1rem 0', borderColor: '#eaeaea' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
            <span>Total</span>
            <span>₹{Number(intent.amount).toLocaleString()}</span>
          </div>
        </div>

        <CheckoutClient 
          orderId={intent.pspOrderId!}
          amount={Number(intent.amount) * 100} // in paise
          currency={intent.currency}
          name={intent.merchant.name}
          keyId={keyId!}
          token={token}
        />
      </div>
    </div>
  );
}
