export interface CommerceError {
  code: string;
  message: string;
  retryable: boolean;
}

const RAZORPAY_ERROR_MAP: Record<string, CommerceError> = {
  BAD_REQUEST_ERROR: { code: 'invalid_checkout_params', message: 'Invalid payment parameters. Please verify the cart and try again.', retryable: false },
  GATEWAY_ERROR: { code: 'payment_provider_unavailable', message: 'Payment gateway is temporarily unavailable. Please try again shortly.', retryable: true },
  SERVER_ERROR: { code: 'payment_provider_error', message: 'Payment provider encountered an internal error. Please try again.', retryable: true },
  insufficient_funds: { code: 'payment_declined_funds', message: 'Payment declined due to insufficient funds.', retryable: false },
  card_declined: { code: 'payment_declined', message: 'Payment method was declined. Please use a different payment method.', retryable: false },
  network_error: { code: 'payment_network_error', message: 'Network error during payment processing. Your funds have not been charged.', retryable: true },
};

export function mapRazorpayError(rawError: string | undefined): CommerceError {
  if (!rawError) {
    return { code: 'payment_unknown_error', message: 'An unexpected payment error occurred.', retryable: false };
  }

  return RAZORPAY_ERROR_MAP[rawError] ?? {
    code: 'payment_error',
    message: 'Payment could not be processed. Please try again or use a different payment method.',
    retryable: false,
  };
}

export class GateRejectionError extends Error {
  constructor(
    public readonly rule: string,
    public readonly decision: string,
    message: string,
  ) {
    super(message);
    this.name = 'GateRejectionError';
  }
}

export class CartStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CartStateError';
  }
}

export class InventoryLockError extends Error {
  constructor(
    public readonly variantId: string,
    message: string,
  ) {
    super(message);
    this.name = 'InventoryLockError';
  }
}
