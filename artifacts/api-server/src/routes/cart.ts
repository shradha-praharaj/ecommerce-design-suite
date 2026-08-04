import { Router, Request } from "express";
import { eq, and } from "drizzle-orm";
import { db, cartItemsTable, productsTable } from "@workspace/db";
import {
  AddToCartBody,
  UpdateCartItemParams,
  UpdateCartItemBody,
  RemoveFromCartParams,
} from "@workspace/api-zod";
import { buildQuote } from "../services/pricing.js";
import type { CartLine } from "../services/pricing.js";
import {
  clearSessionCoupon,
  getSessionCoupon,
  setSessionCoupon,
} from "./session-coupons.js";

import { getAuthUserId } from "../lib/crypto.js";

const router = Router();

function getSessionId(req: Request): string {
  const userId = getAuthUserId(req);
  return userId ? `user_${userId}` : "default";
}

function getUserId(req: Request): number | null {
  return getAuthUserId(req);
}

async function buildCartResponse(
  sessionId: string,
  userId: number | null,
  couponCode?: string,
) {
  const cartRows = await db
    .select()
    .from(cartItemsTable)
    .where(eq(cartItemsTable.sessionId, sessionId));

  const rawLines: CartLine[] = (
    await Promise.all(
      cartRows.map(async (row) => {
        const [product] = await db
          .select()
          .from(productsTable)
          .where(eq(productsTable.id, row.productId))
          .limit(1);
        if (!product) return null;
        return {
          productId: row.productId,
          quantity: row.quantity,
          price: Number(product.price),
          product,
        } as CartLine;
      }),
    )
  ).filter(Boolean) as CartLine[];

  // Use persisted session coupon if no explicit code provided
  const activeCoupon = couponCode ?? getSessionCoupon(sessionId);
  const quote = await buildQuote(rawLines, userId, activeCoupon);

  const validItems = rawLines.map((l) => ({
    product: {
      ...(l.product as any),
      price: Number((l.product as any).price),
      originalPrice:
        (l.product as any).originalPrice != null
          ? Number((l.product as any).originalPrice)
          : null,
      rating: Number((l.product as any).rating),
    },
    quantity: l.quantity,
  }));

  const appliedCode =
    quote.coupon && !quote.coupon.rejectionReason ? quote.coupon.code : null;

  return {
    items: validItems,
    subtotal: quote.subtotal,
    productDiscountAmount: quote.productDiscountAmount,
    discount: quote.couponDiscountAmount,
    deliveryFee: quote.shippingAmount,
    total: quote.total,
    couponApplied: appliedCode,
    couponInfo: quote.coupon ?? null,
  };
}

router.get("/cart", async (req, res): Promise<void> => {
  const sessionId = getSessionId(req);
  const userId = getUserId(req);
  const cart = await buildCartResponse(sessionId, userId);
  res.json(cart);
});

router.post("/cart/items", async (req, res): Promise<void> => {
  const sessionId = getSessionId(req);
  const userId = getUserId(req);
  const parsed = AddToCartBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { productId, quantity } = parsed.data;

  const [existing] = await db
    .select()
    .from(cartItemsTable)
    .where(
      and(
        eq(cartItemsTable.sessionId, sessionId),
        eq(cartItemsTable.productId, productId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(cartItemsTable)
      .set({ quantity: existing.quantity + quantity })
      .where(eq(cartItemsTable.id, existing.id));
  } else {
    await db.insert(cartItemsTable).values({
      sessionId,
      productId,
      quantity,
    });
  }

  const cart = await buildCartResponse(sessionId, userId);
  res.json(cart);
});

router.patch("/cart/items/:productId", async (req, res): Promise<void> => {
  const sessionId = getSessionId(req);
  const userId = getUserId(req);
  const rawId = Array.isArray(req.params.productId)
    ? req.params.productId[0]
    : req.params.productId;
  const paramsParsed = UpdateCartItemParams.safeParse({
    productId: parseInt(rawId, 10),
  });
  const bodyParsed = UpdateCartItemBody.safeParse(req.body);

  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { productId } = paramsParsed.data;
  const { quantity } = bodyParsed.data;

  if (quantity <= 0) {
    await db
      .delete(cartItemsTable)
      .where(
        and(
          eq(cartItemsTable.sessionId, sessionId),
          eq(cartItemsTable.productId, productId),
        ),
      );
  } else {
    await db
      .update(cartItemsTable)
      .set({ quantity })
      .where(
        and(
          eq(cartItemsTable.sessionId, sessionId),
          eq(cartItemsTable.productId, productId),
        ),
      );
  }

  const cart = await buildCartResponse(sessionId, userId);
  res.json(cart);
});

router.delete("/cart/items/:productId", async (req, res): Promise<void> => {
  const sessionId = getSessionId(req);
  const userId = getUserId(req);
  const rawId = Array.isArray(req.params.productId)
    ? req.params.productId[0]
    : req.params.productId;
  const parsed = RemoveFromCartParams.safeParse({
    productId: parseInt(rawId, 10),
  });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db
    .delete(cartItemsTable)
    .where(
      and(
        eq(cartItemsTable.sessionId, sessionId),
        eq(cartItemsTable.productId, parsed.data.productId),
      ),
    );

  const cart = await buildCartResponse(sessionId, userId);
  res.json(cart);
});

/** DELETE /cart/items — empty entire cart */
router.delete("/cart/items", async (req, res): Promise<void> => {
  const sessionId = getSessionId(req);
  const userId = getUserId(req);
  await db
    .delete(cartItemsTable)
    .where(eq(cartItemsTable.sessionId, sessionId));
  clearSessionCoupon(sessionId);
  const cart = await buildCartResponse(sessionId, userId);
  res.json(cart);
});

/** DELETE /cart — empty entire cart */
router.delete("/cart", async (req, res): Promise<void> => {
  const sessionId = getSessionId(req);
  const userId = getUserId(req);
  await db
    .delete(cartItemsTable)
    .where(eq(cartItemsTable.sessionId, sessionId));
  clearSessionCoupon(sessionId);
  const cart = await buildCartResponse(sessionId, userId);
  res.json(cart);
});

/** POST /cart/coupon — apply a coupon to the session */
router.post("/cart/coupon", async (req, res): Promise<void> => {
  const sessionId = getSessionId(req);
  const userId = getUserId(req);
  const { couponCode } = req.body as { couponCode?: string };
  if (!couponCode || typeof couponCode !== "string") {
    res.status(400).json({ error: "couponCode is required" });
    return;
  }
  setSessionCoupon(sessionId, couponCode);
  const cart = await buildCartResponse(
    sessionId,
    userId,
    couponCode.trim().toUpperCase(),
  );
  res.json(cart);
});

/** DELETE /cart/coupon — remove applied coupon */
router.delete("/cart/coupon", async (req, res): Promise<void> => {
  const sessionId = getSessionId(req);
  const userId = getUserId(req);
  clearSessionCoupon(sessionId);
  const cart = await buildCartResponse(sessionId, userId);
  res.json(cart);
});

export default router;
