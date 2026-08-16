import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  trackUserBehaviorEvent,
  computeUserPreferenceProfile,
  loadUserPreferenceProfile,
  saveUserConversationSignal,
} from './user-preference-engine.js';
import { verifyPaymentSignature } from '../lib/razorpay.js';
import { db, usersTable, userBehaviorEventsTable, userPreferenceProfilesTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

describe('UserPreferenceEngine & Razorpay Security', () => {
  let testUserId: number;

  before(async () => {
    const [user] = await db
      .insert(usersTable)
      .values({
        name: 'Shradha Test',
        email: `shradha_test_${Date.now()}@example.com`,
        passwordHash: 'testhash',
        salt: 'testsalt',
      })
      .returning();
    testUserId = user.id;
  });

  after(async () => {
    if (testUserId) {
      await db.delete(userBehaviorEventsTable).where(eq(userBehaviorEventsTable.userId, testUserId));
      await db.delete(userPreferenceProfilesTable).where(eq(userPreferenceProfilesTable.userId, testUserId));
      await db.delete(usersTable).where(eq(usersTable.id, testUserId));
    }
  });

  it('tracks user behavior signals and calculates preference scores accurately', async () => {
    // Track gaming view and purchase events
    await trackUserBehaviorEvent({
      userId: testUserId,
      sessionId: `test_session_${testUserId}`,
      eventType: 'view',
      category: 'Gaming',
      brand: 'Samsung',
    });

    await trackUserBehaviorEvent({
      userId: testUserId,
      sessionId: `test_session_${testUserId}`,
      eventType: 'purchase',
      category: 'Gaming',
      brand: 'Samsung',
      metadata: { price: 45000 },
    });

    await saveUserConversationSignal(
      testUserId,
      'I loved Samsung mobile from iPhone and I love to game',
      'Gaming',
      'Samsung',
    );

    const profile = await computeUserPreferenceProfile(testUserId);
    assert.ok(profile, 'Preference profile should be created');
    assert.ok((profile.topCategories as string[]).includes('Gaming'), 'Top categories should include Gaming');
    assert.ok((profile.topBrands as string[]).includes('Samsung'), 'Top brands should include Samsung');
    assert.equal(profile.personaHint, 'gamer', 'Persona hint should be gamer');
  });

  it('verifies valid HMAC-SHA256 Razorpay payment signatures', () => {
    const orderId = 'order_test_12345';
    const paymentId = 'pay_test_67890';
    const secret = process.env.RAZORPAY_KEY_SECRET || 'MDrZBYsQBAJpcDf08Q1G3mod';

    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const isValid = verifyPaymentSignature({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: validSignature,
    });
    assert.equal(isValid, true, 'Valid signature must return true');

    const isTamperedValid = verifyPaymentSignature({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: 'bad_signature_0000000000000000000000000000000000000000000000000000000000000000',
    });
    assert.equal(isTamperedValid, false, 'Tampered signature must return false');
  });
});
