import { Router } from "express";
import {
  db,
  ordersTable,
  orderItemsTable,
  cartItemsTable,
  productsTable,
  couponRedemptionsTable,
  couponsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { buildQuote } from "../services/pricing.js";
import type { CartLine } from "../services/pricing.js";
import { getSessionCoupon } from "./session-coupons.js";
import { getAuthUserId } from "../lib/crypto.js";

export const checkoutRouter = Router();

checkoutRouter.post("/checkout", async (req, res) => {
  const userId = getAuthUserId(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const sessionId = `user_${userId}`;

  const { address, payment, couponCode } = req.body as {
    address: Record<string, string>;
    payment: Record<string, string>;
    couponCode?: string;
  };
  if (!address || !payment) {
    return res
      .status(400)
      .json({ message: "Address and payment details are required" });
  }

  try {
    // 1. Get cart items with prices
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
      return res.status(400).json({ message: "Cart is empty" });
    }

    // 2. Build authoritative quote inside a single transaction
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

    // 3. Transactional order creation
    const result = await db.transaction(async (tx) => {
      // Re-evaluate coupon limits inside transaction with locking
      const appliedCoupon =
        quote.coupon && !quote.coupon.rejectionReason ? quote.coupon : null;

      if (appliedCoupon) {
        // Lock the coupon row to prevent concurrent over-redemption
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
          throw new Error("Coupon is no longer active");
        }
      }

      // Create order with full monetary snapshot
      const subtotalAmount = String(quote.subtotal);
      const productDiscountAmount = String(quote.productDiscountAmount);
      const couponDiscountAmount = String(quote.couponDiscountAmount);
      const shippingAmount = String(quote.shippingAmount);
      const totalAmount = String(quote.total);

      const [newOrder] = await tx
        .insert(ordersTable)
        .values({
          userId,
          subtotalAmount,
          productDiscountAmount,
          couponDiscountAmount,
          shippingAmount,
          totalAmount,
          appliedCouponCode: appliedCoupon?.code ?? null,
          couponSnapshot: appliedCoupon
            ? JSON.parse(JSON.stringify(appliedCoupon))
            : null,
          status: "Completed",
          shippingAddress: address,
          paymentDetails: {
            cardNumber: `**** **** **** ${payment.cardNumber?.slice(-4) ?? "****"}`,
          },
        })
        .returning();

      // Create order items
      for (const item of userCartItems) {
        await tx.insert(orderItemsTable).values({
          orderId: newOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          priceAtPurchase: item.price,
        });
      }

      // Record coupon redemption (auditable, limit-safe)
      if (appliedCoupon && "eligibleSubtotal" in appliedCoupon) {
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
            orderId: newOrder.id,
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

      return newOrder;
    });

    return res
      .status(200)
      .json({ message: "Order successful", orderId: result.id });
  } catch (error) {
    console.error("Checkout error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({ message });
  }
});
