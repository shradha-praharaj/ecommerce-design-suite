import {
  db,
  userBehaviorEventsTable,
  userPreferenceProfilesTable,
  ordersTable,
  orderItemsTable,
  productsTable,
  type UserPreferenceProfile,
} from '@workspace/db';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';

export interface BehaviorEventInput {
  userId?: number | null;
  sessionId: string;
  eventType:
    | 'view'
    | 'search'
    | 'add_to_cart'
    | 'purchase'
    | 'chatbot_query'
    | 'preference_stated';
  productId?: number | null;
  category?: string | null;
  brand?: string | null;
  keyword?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Track a behavior signal into the event stream
 */
export async function trackUserBehaviorEvent(
  input: BehaviorEventInput,
): Promise<void> {
  try {
    const {
      userId,
      sessionId,
      eventType,
      productId,
      category,
      brand,
      keyword,
      metadata,
    } = input;

    let finalCategory = category;
    let finalBrand = brand;

    // If product ID is provided but category/brand is missing, look it up
    if (productId && (!finalCategory || !finalBrand)) {
      const [product] = await db
        .select({
          category: productsTable.category,
          brand: productsTable.brand,
        })
        .from(productsTable)
        .where(eq(productsTable.id, productId))
        .limit(1);

      if (product) {
        finalCategory = finalCategory || product.category;
        finalBrand = finalBrand || product.brand;
      }
    }

    await db.insert(userBehaviorEventsTable).values({
      userId: userId || null,
      sessionId,
      eventType,
      productId: productId || null,
      category: finalCategory || null,
      brand: finalBrand || null,
      keyword: keyword || null,
      metadata: metadata ? metadata : null,
    });

    // If authenticated and high-intent event, trigger background profile recalculation
    if (
      userId &&
      (eventType === 'purchase' ||
        eventType === 'preference_stated' ||
        eventType === 'add_to_cart')
    ) {
      void computeUserPreferenceProfile(userId);
    }
  } catch (err) {
    console.warn('Error tracking user behavior event:', err);
  }
}

/**
 * Compute and upsert the production-grade preference profile for a user
 */
export async function computeUserPreferenceProfile(
  userId: number,
): Promise<UserPreferenceProfile | null> {
  try {
    // 1. Fetch recent events (up to 150)
    const events = await db
      .select()
      .from(userBehaviorEventsTable)
      .where(eq(userBehaviorEventsTable.userId, userId))
      .orderBy(desc(userBehaviorEventsTable.createdAt))
      .limit(150);

    // 2. Fetch past orders
    const pastOrders = await db
      .select({
        id: ordersTable.id,
        totalAmount: ordersTable.totalAmount,
      })
      .from(ordersTable)
      .where(eq(ordersTable.userId, userId))
      .orderBy(desc(ordersTable.createdAt))
      .limit(10);

    const categoryScores: Record<string, number> = {};
    const brandScores: Record<string, number> = {};
    let giftMentions = 0;
    let totalConversations = 0;
    const explicitSignals: string[] = [];
    const purchaseAmounts: number[] = [];

    // Weight table
    const weights: Record<string, number> = {
      purchase: 5,
      add_to_cart: 3,
      preference_stated: 8,
      chatbot_query: 2,
      view: 1,
      search: 1.5,
    };

    for (const ev of events) {
      const w = weights[ev.eventType] || 1;

      if (ev.category) {
        categoryScores[ev.category] = (categoryScores[ev.category] || 0) + w;
      }
      if (ev.brand) {
        brandScores[ev.brand] = (brandScores[ev.brand] || 0) + w;
      }

      if (ev.eventType === 'chatbot_query' || ev.eventType === 'preference_stated') {
        totalConversations++;
        if (ev.metadata && typeof ev.metadata === 'object') {
          const meta = ev.metadata as Record<string, any>;
          if (meta.recipient === 'other' || meta.isGift) {
            giftMentions++;
          }
          if (meta.signal && typeof meta.signal === 'string') {
            explicitSignals.push(meta.signal);
          }
        }
      }
    }

    // Include ordered items in brand & category weighting
    if (pastOrders.length > 0) {
      const orderIds = pastOrders.map((o) => o.id);
      const items = await db
        .select({
          category: productsTable.category,
          brand: productsTable.brand,
          price: productsTable.price,
        })
        .from(orderItemsTable)
        .innerJoin(
          productsTable,
          eq(productsTable.id, orderItemsTable.productId),
        )
        .where(inArray(orderItemsTable.orderId, orderIds));

      items.forEach((item) => {
        categoryScores[item.category] =
          (categoryScores[item.category] || 0) + 6;
        brandScores[item.brand] = (brandScores[item.brand] || 0) + 6;
        const p = parseFloat(item.price);
        if (!isNaN(p) && p > 0) purchaseAmounts.push(p);
      });
    }

    // Top categories sorted by score
    const topCategories = Object.entries(categoryScores)
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat)
      .slice(0, 5);

    // Top brands sorted by score
    const topBrands = Object.entries(brandScores)
      .sort((a, b) => b[1] - a[1])
      .map(([brand]) => brand)
      .slice(0, 5);

    // Use cases identification
    const useCasesSet = new Set<string>();
    if (
      categoryScores['Gaming'] ||
      topCategories.includes('Gaming') ||
      explicitSignals.some((s) => s.toLowerCase().includes('game'))
    ) {
      useCasesSet.add('gaming');
    }
    if (
      (categoryScores['Audio'] || 0) >= 3 ||
      explicitSignals.some((s) => s.toLowerCase().includes('music') || s.toLowerCase().includes('sound'))
    ) {
      useCasesSet.add('music');
      useCasesSet.add('audiophile');
    }
    if (
      topCategories.includes('Laptops') ||
      topCategories.includes('Accessories')
    ) {
      useCasesSet.add('professional');
      useCasesSet.add('productivity');
    }
    if (
      categoryScores['Cameras'] ||
      explicitSignals.some((s) => s.toLowerCase().includes('photo') || s.toLowerCase().includes('camera'))
    ) {
      useCasesSet.add('photography');
    }

    // Persona Hint
    let personaHint: string | null = null;
    if (useCasesSet.has('gaming')) {
      personaHint = 'gamer';
    } else if (useCasesSet.has('audiophile')) {
      personaHint = 'audiophile';
    } else if (useCasesSet.has('photography')) {
      personaHint = 'photographer';
    } else if (useCasesSet.has('professional')) {
      personaHint = 'professional';
    }

    // Price Range Calculation
    let priceRange: { min: number; max: number } | null = null;
    if (purchaseAmounts.length > 0) {
      const avg =
        purchaseAmounts.reduce((a, b) => a + b, 0) / purchaseAmounts.length;
      priceRange = {
        min: Math.max(1000, Math.round(avg * 0.6)),
        max: Math.round(avg * 1.5),
      };
    }

    // Gift buyer score
    const giftBuyerScore =
      totalConversations > 0
        ? Math.min(1, parseFloat((giftMentions / totalConversations).toFixed(3)))
        : 0;

    // Deduplicate conversation signals
    const uniqueSignals = Array.from(new Set(explicitSignals)).slice(-15);

    // Upsert into DB
    const [profile] = await db
      .insert(userPreferenceProfilesTable)
      .values({
        userId,
        topCategories,
        topBrands,
        useCases: Array.from(useCasesSet),
        priceRange,
        personaHint,
        giftBuyerScore: String(giftBuyerScore),
        conversationSignals: uniqueSignals,
        lastComputedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userPreferenceProfilesTable.userId,
        set: {
          topCategories,
          topBrands,
          useCases: Array.from(useCasesSet),
          priceRange,
          personaHint,
          giftBuyerScore: String(giftBuyerScore),
          conversationSignals: uniqueSignals,
          lastComputedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    return profile;
  } catch (err) {
    console.error('Error computing user preference profile:', err);
    return null;
  }
}

/**
 * Load user preference profile (with auto-computation if missing or stale)
 */
export async function loadUserPreferenceProfile(
  userId: number,
): Promise<UserPreferenceProfile | null> {
  try {
    const profile = await db.query.userPreferenceProfilesTable.findFirst({
      where: eq(userPreferenceProfilesTable.userId, userId),
    });

    if (!profile) {
      return computeUserPreferenceProfile(userId);
    }

    // Recompute if stale > 2 hours
    const ageMs = Date.now() - new Date(profile.lastComputedAt).getTime();
    if (ageMs > 2 * 60 * 60 * 1000) {
      void computeUserPreferenceProfile(userId);
    }

    return profile;
  } catch (err) {
    console.error('Error loading user preference profile:', err);
    return null;
  }
}

/**
 * Save an explicit conversation preference signal
 */
export async function saveUserConversationSignal(
  userId: number,
  signal: string,
  category?: string,
  brand?: string,
): Promise<void> {
  await trackUserBehaviorEvent({
    userId,
    sessionId: `user_${userId}`,
    eventType: 'preference_stated',
    category,
    brand,
    metadata: { signal },
  });
}

/**
 * Merge anonymous guest events into an authenticated user on login
 */
export async function mergeAnonymousEvents(
  sessionId: string,
  userId: number,
): Promise<void> {
  try {
    await db
      .update(userBehaviorEventsTable)
      .set({ userId })
      .where(
        and(
          eq(userBehaviorEventsTable.sessionId, sessionId),
          sql`${userBehaviorEventsTable.userId} IS NULL`,
        ),
      );

    void computeUserPreferenceProfile(userId);
  } catch (err) {
    console.warn('Error merging anonymous events:', err);
  }
}
