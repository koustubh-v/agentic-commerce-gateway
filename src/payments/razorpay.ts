import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env } from '../config/env.js';

let razorpayInstance: Razorpay | null = null;

function getRazorpay(): Razorpay {
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
}

export interface RazorpayOrderParams {
  amount: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrderResult {
  id: string;
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

export async function createRazorpayOrder(params: RazorpayOrderParams): Promise<RazorpayOrderResult> {
  const rzp = getRazorpay();
  const order: any = await rzp.orders.create({
    amount: params.amount,
    currency: params.currency,
    receipt: params.receipt,
    payment_capture: false,
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

export async function capturePayment(paymentId: string, amount: number): Promise<any> {
  const rzp = getRazorpay();
  return (rzp.payments as any).capture(paymentId, amount);
}

export async function fetchRazorpayOrderStatus(razorpayOrderId: string): Promise<RazorpayPaymentStatus | null> {
  const rzp = getRazorpay();
  const payments: any = await rzp.orders.fetchPayments(razorpayOrderId);

  if (!payments?.items?.length) return null;

  const payment: any = payments.items.find((p: any) => p.status === 'captured')
    || payments.items.find((p: any) => p.status === 'authorized')
    || payments.items[0];

  if (!payment) return null;

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

export function verifyRazorpayWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}
