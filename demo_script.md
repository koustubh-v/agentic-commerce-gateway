# Graceful Failure Demo (Race Condition)

This script demonstrates the "Money-Action Gate" gracefully rejecting a payment when inventory is depleted between authorization and capture. This proves the system avoids capturing funds for items it cannot fulfill.

## Setup
1. Ensure the gateway is running: `npm run dev`
2. Ensure you have a product variant with exactly **1** in stock. Let's call the IDs `$MERCHANT_ID`, `$PRODUCT_ID`, and `$VARIANT_ID`.

Set your variables in your terminal:
```bash
export ACG_URL="http://localhost:3000"
export MERCHANT_ID="<your-merchant-id>"
export PRODUCT_ID="<your-product-id>"
export VARIANT_ID="<your-variant-id>"
```

## Step 1: Agent A Initiates Checkout
Agent A attempts to buy the last item in stock.

```bash
curl -X POST "$ACG_URL/acp/checkout_sessions" \
  -H "Content-Type: application/json" \
  -d '{
    "merchantId": "'"$MERCHANT_ID"'",
    "items": [
      {
        "productId": "'"$PRODUCT_ID"'",
        "variantId": "'"$VARIANT_ID"'",
        "quantity": 1
      }
    ]
  }'
```
**Expected Response:**
A successful response with `checkoutSessionId`, `checkoutToken`, and `razorpayOrderId`. 
The inventory lock is now acquired by Agent A for this cart.

*Save the `checkoutSessionId` (which is the order ID) and `razorpayOrderId`.*
```bash
export SESSION_A="<checkoutSessionId>"
export RZP_ORDER_A="<razorpayOrderId>"
```

## Step 2: Agent B Attempts to Buy the Same Item (Concurrent)
Before Agent A completes payment, Agent B tries to check out the same item.

```bash
curl -X POST "$ACG_URL/acp/checkout_sessions" \
  -H "Content-Type: application/json" \
  -d '{
    "merchantId": "'"$MERCHANT_ID"'",
    "items": [
      {
        "productId": "'"$PRODUCT_ID"'",
        "variantId": "'"$VARIANT_ID"'",
        "quantity": 1
      }
    ]
  }'
```
**Expected Response:**
```json
{
  "error": "Item reserved by another checkout. Please try again shortly."
}
```
*This confirms the concurrency lock works during checkout initiation.*

## Step 3: Simulate External Inventory Depletion
To simulate the race condition where stock is depleted *after* lock acquisition (e.g. a manual DB update by the merchant, or a bypass of the system):

Open `psql` or Prisma Studio and manually set the inventory of `$VARIANT_ID` to 0.
```sql
UPDATE "Variant" SET inventory = 0 WHERE id = '<your-variant-id>';
```

## Step 4: Agent A Completes Payment
Agent A enters their card details on Razorpay's checkout using `RZP_ORDER_A` and authorizes the payment.

You can simulate the Razorpay webhook firing for `payment.authorized`:
```bash
# You need the actual webhook secret here
export WEBHOOK_SECRET="<your-razorpay-webhook-secret>"

# Construct the payload
PAYLOAD='{
  "entity": "event",
  "event": "payment.authorized",
  "contains": ["payment"],
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_fake123",
        "amount": 1000,
        "currency": "INR",
        "status": "authorized",
        "order_id": "'"$RZP_ORDER_A"'",
        "method": "card"
      }
    }
  }
}'

# Generate Signature (HMAC SHA256 of payload using WEBHOOK_SECRET)
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" | sed 's/^.* //')

curl -X POST "$ACG_URL/webhooks/razorpay" \
  -H "Content-Type: application/json" \
  -H "x-razorpay-signature: $SIGNATURE" \
  -H "x-razorpay-event-id: evt_fake123" \
  -d "$PAYLOAD"
```

## Step 5: Verify the Graceful Failure
The `payment.authorized` webhook triggers the `runPreCaptureGate`. The gate will re-verify inventory, see it is 0, and **reject** the capture.

Check the transaction status:
```bash
curl "$ACG_URL/acp/checkout_sessions/$SESSION_A"
```

**Expected Response:**
You should see that the `status` is `CAPTURE_SKIPPED` and the audit log contains the gate rejection reason:
```json
{
  "transactionId": "...",
  "orderId": "...",
  "status": "CAPTURE_SKIPPED",
  "gateDecision": "APPROVED",
  "auditTrail": [
    {
      "eventType": "GATE_DECISION_PRE_CAPTURE",
      "actor": "system:gateway",
      "payload": {
        "decision": "REJECTED",
        "rule": "INVENTORY_CHECK",
        "message": "Variant <your-variant-id> is out of stock"
      },
      "createdAt": "..."
    },
    {
      "eventType": "CAPTURE_SKIPPED",
      "actor": "system:gateway",
      "payload": {
        "reason": "Variant <your-variant-id> is out of stock",
        "rule": "INVENTORY_CHECK"
      },
      "createdAt": "..."
    }
  ]
}
```

Because the capture was skipped, Razorpay will automatically refund the `authorized` payment to the customer after 5 days (or you can trigger an explicit void). The failure is graceful, bidirectional, and explainable to the agent/user.
