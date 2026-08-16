import Razorpay from 'razorpay';
import crypto from 'crypto';

export function getRazorpayKeyId(): string {
  return (
    process.env.RAZORPAY_KEY_ID ||
    process.env.API_TEST_KEY ||
    'rzp_test_TQKu0hB9IKHzD1'
  );
}

export function getRazorpayKeySecret(): string {
  return (
    process.env.RAZORPAY_KEY_SECRET ||
    process.env.API_KEY_SECRET ||
    'MDrZBYsQBAJpcDf08Q1G3mod'
  );
}

let razorpayClient: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: getRazorpayKeyId(),
      key_secret: getRazorpayKeySecret(),
    });
  }
  return razorpayClient;
}

export async function createRazorpayOrder(params: {
  amountInRupees: number;
  receipt?: string;
  notes?: Record<string, string>;
}) {
  const client = getRazorpayClient();
  const amountInPaise = Math.round(params.amountInRupees * 100);

  return client.orders.create({
    amount: amountInPaise,
    currency: 'INR',
    receipt: params.receipt || `order_rcptid_${Date.now()}`,
    notes: params.notes,
  });
}


/**
 * Verify Razorpay payment signature from client checkout modal
 * Signature = HMAC-SHA256(razorpay_order_id + "|" + razorpay_payment_id, secret)
 */
export function verifyPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = params;
    const secret = getRazorpayKeySecret();
    const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(razorpaySignature, 'hex');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

/**
 * Verify Razorpay webhook signature from X-Razorpay-Signature header
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  webhookSecret?: string,
): boolean {
  try {
    const secret = webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret || !signature) return false;

    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(signature, 'hex');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch (err) {
    console.error('Webhook verification error:', err);
    return false;
  }
}
