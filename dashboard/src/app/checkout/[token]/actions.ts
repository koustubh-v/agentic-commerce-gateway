'use server';

import { prisma } from '@/lib/prisma';

export async function markCheckoutComplete(token: string, paymentId: string) {
  const intent = await prisma.paymentIntent.findFirst({
    where: { checkoutToken: token },
    include: { order: true }
  });
  
  if (!intent) return;

  // Complete the payment intent and order in the DB (Simulates the Razorpay Webhook for demo purposes)
  await prisma.$transaction([
    prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { status: 'PSP_SUCCEEDED', pspPaymentId: paymentId }
    }),
    prisma.order.update({
      where: { id: intent.orderId },
      data: { status: 'CONFIRMED' }
    })
  ]);

  // Simulate ACG's webhook dispatch to the merchant's EPW backend
  const merchant = await prisma.merchant.findUnique({ where: { id: intent.merchantId } });
  if (merchant?.fulfillmentWebhookUrl) {
    const fullOrder = await prisma.order.findUnique({
      where: { id: intent.orderId },
      include: { cart: { include: { items: { include: { product: true } } } } }
    });
    
    try {
      const payload = {
        ...fullOrder,
        items: fullOrder?.cart?.items.map(item => ({
          ...item,
          productId: item.product?.externalId || item.productId
        })) || []
      };

      await fetch(merchant.fulfillmentWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orderData: payload })
      });
    } catch (e) {
      console.error("Failed to trigger webhook to merchant:", e);
    }
  }
}
