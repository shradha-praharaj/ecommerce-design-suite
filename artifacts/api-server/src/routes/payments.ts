import { Router } from 'express';
import {
  db,
  ordersTable,
  orderItemsTable,
  cartItemsTable,
  productsTable,
  couponsTable,
  couponRedemptionsTable,
} from '@workspace/db';
import { eq, sql } from 'drizzle-orm';
import { buildQuote, type CartLine } from '../services/pricing.js';
import { getSessionCoupon } from './session-coupons.js';
import { getAuthUserId } from '../lib/crypto.js';
import {
  getRazorpayClient,
  getRazorpayKeyId,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '../lib/razorpay.js';
import { trackUserBehaviorEvent } from '../agents/user-preference-engine.js';

export const paymentsRouter = Router();

/**
 * Initialize a Razorpay checkout session:
 * Computes authoritative cart quote and creates a Razorpay Order ID.
 */
paymentsRouter.post('/create-order', async (req, res): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Login required for online checkout' });
    return;
  }
  const sessionId = `user_${userId}`;
  const { couponCode } = req.body as { couponCode?: string };

  try {
    const userCartItems = await db
      .select({
        id: cartItemsTable.id,
        productId: cartItemsTable.productId,
        quantity: cartItemsTable.quantity,
        price: productsTable.price,
      })
      .from(cartItemsTable)
      .innerJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
      .where(eq(cartItemsTable.sessionId, sessionId));

    if (userCartItems.length === 0) {
      res.status(400).json({ message: 'Cart is empty' });
      return;
    }

    const lines: CartLine[] = userCartItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      price: parseFloat(item.price),
    }));

    const quote = await buildQuote(
      lines,
      userId,
      couponCode ?? getSessionCoupon(sessionId),
    );

    const totalAmountInPaise = Math.round(quote.total * 100);

    const rzp = getRazorpayClient();
    const razorpayOrder = await rzp.orders.create({
      amount: totalAmountInPaise,
      currency: 'INR',
      receipt: `rcpt_${userId}_${Date.now()}`,
      notes: {
        userId: String(userId),
        itemCount: String(userCartItems.length),
      },
    });

    res.status(200).json({
      razorpayOrderId: razorpayOrder.id,
      amount: totalAmountInPaise,
      currency: 'INR',
      keyId: getRazorpayKeyId(),
      quote,
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({
      message:
        error instanceof Error ? error.message : 'Failed to initiate payment',
    });
  }
});

/**
 * Verify Razorpay payment signature & complete order placement transactionally
 */
paymentsRouter.post('/verify', async (req, res): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const sessionId = `user_${userId}`;

  const {
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    address,
    couponCode,
  } = req.body as {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    address: Record<string, string>;
    couponCode?: string;
  };

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    res.status(400).json({
      message: 'Razorpay payment confirmation details are missing',
      success: false,
    });
    return;
  }

  if (!address) {
    res.status(400).json({
      message: 'Delivery address is required',
      success: false,
    });
    return;
  }

  // 1. Verify cryptographic HMAC signature
  const isSignatureValid = verifyPaymentSignature({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  });

  if (!isSignatureValid) {
    res.status(400).json({
      message: 'Payment verification failed: cryptographic signature mismatch',
      success: false,
    });
    return;
  }

  try {
    // 2. Fetch user cart
    const userCartItems = await db
      .select({
        id: cartItemsTable.id,
        productId: cartItemsTable.productId,
        quantity: cartItemsTable.quantity,
        price: productsTable.price,
        name: productsTable.name,
        category: productsTable.category,
        brand: productsTable.brand,
      })
      .from(cartItemsTable)
      .innerJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
      .where(eq(cartItemsTable.sessionId, sessionId));

    if (userCartItems.length === 0) {
      res.status(400).json({ message: 'Cart is empty', success: false });
      return;
    }

    const lines: CartLine[] = userCartItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      price: parseFloat(item.price),
    }));

    const quote = await buildQuote(
      lines,
      userId,
      couponCode ?? getSessionCoupon(sessionId),
    );

    // 3. Atomically persist order and clear cart
    const newOrder = await db.transaction(async (tx) => {
      const appliedCoupon =
        quote.coupon && !quote.coupon.rejectionReason ? quote.coupon : null;

      if (appliedCoupon) {
        const [couponRow] = await tx
          .select()
          .from(couponsTable)
          .where(
            eq(
              sql`upper(${couponsTable.code})`,
              appliedCoupon.code.toUpperCase(),
            ),
          )
          .limit(1);

        if (!couponRow || !couponRow.isActive) {
          throw new Error('Coupon is no longer active');
        }
      }

      const [order] = await tx
        .insert(ordersTable)
        .values({
          userId,
          subtotalAmount: String(quote.subtotal),
          productDiscountAmount: String(quote.productDiscountAmount),
          couponDiscountAmount: String(quote.couponDiscountAmount),
          shippingAmount: String(quote.shippingAmount),
          totalAmount: String(quote.total),
          appliedCouponCode: appliedCoupon?.code ?? null,
          couponSnapshot: appliedCoupon
            ? JSON.parse(JSON.stringify(appliedCoupon))
            : null,
          status: 'Processing',
          paymentGateway: 'razorpay',
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
          paymentStatus: 'paid',
          paidAt: new Date(),
          shippingAddress: address,
          paymentDetails: {
            method: 'Razorpay Online',
            razorpayPaymentId,
            razorpayOrderId,
            paidAt: new Date().toISOString(),
          },
        })
        .returning();

      for (const item of userCartItems) {
        await tx.insert(orderItemsTable).values({
          orderId: order.id,
          productId: item.productId,
          quantity: item.quantity,
          priceAtPurchase: item.price,
        });
      }

      if (appliedCoupon && 'eligibleSubtotal' in appliedCoupon) {
        const [couponRow] = await tx
          .select({ id: couponsTable.id })
          .from(couponsTable)
          .where(
            eq(
              sql`upper(${couponsTable.code})`,
              appliedCoupon.code.toUpperCase(),
            ),
          )
          .limit(1);
        if (couponRow) {
          await tx.insert(couponRedemptionsTable).values({
            couponId: couponRow.id,
            orderId: order.id,
            userId,
            codeSnapshot: appliedCoupon.code,
            discountApplied: String(appliedCoupon.appliedDiscount),
            eligibleSubtotal: String(appliedCoupon.eligibleSubtotal),
          });
        }
      }

      // Clear cart
      await tx
        .delete(cartItemsTable)
        .where(eq(cartItemsTable.sessionId, sessionId));

      return order;
    });

    // 4. Asynchronously track purchase signals for recommendation engine
    for (const item of userCartItems) {
      void trackUserBehaviorEvent({
        userId,
        sessionId,
        eventType: 'purchase',
        productId: item.productId,
        category: item.category,
        brand: item.brand,
        metadata: {
          orderId: newOrder.id,
          price: item.price,
          quantity: item.quantity,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified and order created successfully',
      orderId: newOrder.id,
    });
  } catch (error) {
    console.error('Error completing order after payment verification:', error);
    res.status(500).json({
      success: false,
      message:
        error instanceof Error ? error.message : 'Internal checkout error',
    });
  }
});

/**
 * Razorpay Webhook Handler for asynchronous payment capture/failure events
 */
paymentsRouter.post('/webhook', async (req, res): Promise<void> => {
  const signature = req.headers['x-razorpay-signature'] as string;
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  if (process.env.RAZORPAY_WEBHOOK_SECRET) {
    const isValid = verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      console.warn('[Razorpay Webhook] Invalid webhook signature received');
      res.status(400).json({ message: 'Invalid signature' });
      return;
    }
  }

  const event = req.body;
  const eventType = event?.event;
  const payload = event?.payload?.payment?.entity;

  try {
    if (eventType === 'payment.captured' && payload?.order_id) {
      await db
        .update(ordersTable)
        .set({
          paymentStatus: 'paid',
          razorpayPaymentId: payload.id,
          paidAt: new Date(),
        })
        .where(eq(ordersTable.razorpayOrderId, payload.order_id));
    } else if (eventType === 'payment.failed' && payload?.order_id) {
      await db
        .update(ordersTable)
        .set({
          paymentStatus: 'failed',
          status: 'Cancelled',
        })
        .where(eq(ordersTable.razorpayOrderId, payload.order_id));
    }
  } catch (err) {
    console.error('[Razorpay Webhook] Error updating payment status:', err);
  }

  res.status(200).json({ status: 'ok' });
});
