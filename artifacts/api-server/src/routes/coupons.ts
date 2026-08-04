/**
 * coupons.ts — Routes for coupon validation and listing.
 *
 * POST /cart/coupon    → apply coupon to session (in cart.ts)
 * DELETE /cart/coupon  → remove coupon from session (in cart.ts)
 * GET /coupons/validate → validate a code without applying (for chatbot/UI preview)
 */

import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db, couponsTable, couponRulesTable } from '@workspace/db';
import { buildQuote } from '../services/pricing.js';
import type { CartLine } from '../services/pricing.js';

import { getAuthUserId } from '../lib/crypto.js';

export const couponsRouter = Router();

couponsRouter.get('/coupons/validate', async (req, res): Promise<void> => {
  const { code, cartTotal } = req.query as {
    code?: string;
    cartTotal?: string;
  };

  if (!code) {
    res
      .status(400)
      .json({ valid: false, message: 'code query param is required' });
    return;
  }

  const userId = getAuthUserId(req);

  try {
    const [coupon] = await db
      .select()
      .from(couponsTable)
      .where(eq(sql`upper(${couponsTable.code})`, code.toUpperCase()))
      .limit(1);

    if (!coupon) {
      res.json({ valid: false, code, message: 'Coupon code not found' });
      return;
    }

    // Build a synthetic single-line cart matching the supplied cartTotal for preview
    const total = parseFloat(cartTotal ?? '0');
    const syntheticLines: CartLine[] =
      total > 0 ? [{ productId: 0, quantity: 1, price: total }] : [];

    const quote = await buildQuote(syntheticLines, userId, code);
    const couponResult = quote.coupon;
    const valid = !!(couponResult && !couponResult.rejectionReason);

    res.json({
      valid,
      code: coupon.code,
      couponInfo: couponResult,
      message: valid
        ? `${coupon.campaignName}: saves ₹${(couponResult as any).appliedDiscount}`
        : ((couponResult as any)?.rejectionReason ??
          'Coupon cannot be applied'),
    });
  } catch (err) {
    console.error('Coupon validate error:', err);
    res.status(500).json({ valid: false, message: 'Internal server error' });
  }
});

/**
 * GET /coupons/active
 *
 * Returns currently active coupons with their eligibility rules.
 * The chatbot calls this to answer "what coupons are available for Gaming?".
 */
couponsRouter.get('/coupons/active', async (req, res): Promise<void> => {
  try {
    const now = new Date();

    const rows = await db
      .select()
      .from(couponsTable)
      .where(eq(couponsTable.isActive, true))
      .orderBy(sql`${couponsTable.priority} desc`);

    const activeCoupons = rows.filter((c) => {
      if (c.startsAt && new Date(c.startsAt) > now) return false;
      if (c.expiresAt && new Date(c.expiresAt) < now) return false;
      return true;
    });

    const result = await Promise.all(
      activeCoupons.map(async (c) => {
        const rules = await db
          .select()
          .from(couponRulesTable)
          .where(eq(couponRulesTable.couponId, c.id));
        return { ...c, rules };
      }),
    );

    res.json(result);
  } catch (err) {
    console.error('Coupons active error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});
