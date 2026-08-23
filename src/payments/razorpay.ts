import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Razorpay Client — stub for Phase 1
// Full implementation in the Payment Phase.
// Interfaces are defined so callers don't need to change when Phase 2 lands.
// ---------------------------------------------------------------------------

export interface RazorpayOrderParams {
  amount: number;        // In paise (INR × 100)
  currency: string;
  receipt: string;       // Merchant's internal order reference
  notes?: Record<string, string>;
}

export interface RazorpayOrderResult {
  id: string;            // Razorpay Order ID: order_xxx
  entity: 'order';
  amount: number;
  currency: string;
  receipt: string;
  status: 'created' | 'attempted' | 'paid';
  created_at: number;
}

export interface RazorpayPaymentStatus {
  id: string;
  entity: 'payment';
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  order_id: string;
  method: string;
  captured: boolean;
}

import Razorpay from 'razorpay';
import { env } from '../config/env.js';

let razorpayInstance: Razorpay | null = null;

function getRazorpay(): Razorpay {
  if (!razorpayInstance) {
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay credentials not configured');
    }
    razorpayInstance = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
}

/**
 * Create a Razorpay order.
 */
export async function createRazorpayOrder(
  params: RazorpayOrderParams,
): Promise<RazorpayOrderResult> {
  const rzp = getRazorpay();
  const order: any = await rzp.orders.create({
    amount: params.amount,
    currency: params.currency,
    receipt: params.receipt,
    notes: params.notes,
  } as any);

  return {
    id: order.id,
    entity: 'order',
    amount: typeof order.amount === 'number' ? order.amount : parseInt(order.amount, 10),
    currency: order.currency,
    receipt: order.receipt,
    status: order.status,
    created_at: order.created_at,
  };
}

/**
 * Fetch Razorpay order status (for reconciler).
 */
export async function fetchRazorpayOrderStatus(
  razorpayOrderId: string,
): Promise<RazorpayPaymentStatus | null> {
  const rzp = getRazorpay();
  const payments: any = await rzp.orders.fetchPayments(razorpayOrderId);
  
  if (!payments || !payments.items || payments.items.length === 0) {
    return null;
  }
  
  // Get the most relevant payment (usually the latest or captured one)
  const payment: any = payments.items.find((p: any) => p.status === 'captured') || payments.items[0];

  return {
    id: payment.id,
    entity: 'payment',
    amount: typeof payment.amount === 'number' ? payment.amount : parseInt(payment.amount, 10),
    currency: payment.currency,
    status: payment.status,
    order_id: payment.order_id,
    method: payment.method,
    captured: payment.captured,
  };
}

/**
 * Verify Razorpay webhook signature.
 * Phase 1 stub — this IS safe to call because it's pure crypto.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}
