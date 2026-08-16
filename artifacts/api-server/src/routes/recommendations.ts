import { Router } from 'express';
import { ne, eq, inArray, desc } from 'drizzle-orm';
import { db, productsTable, usersTable, cartItemsTable } from '@workspace/db';
import { GetPdpRecommendationsParams } from '@workspace/api-zod';
import { cacheMiddleware } from '../middlewares/cache.js';
import { getAuthUserId } from '../lib/crypto.js';
import { loadUserPreferenceProfile } from '../agents/user-preference-engine.js';

const THREE_MIN = 3 * 60 * 1000;

async function getFirstName(req: any): Promise<string> {
  const userId = getAuthUserId(req);
  if (!userId) return 'You';
  try {
    const [user] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    return user ? user.name.trim().split(/\s+/)[0] : 'You';
  } catch {
    return 'You';
  }
}

const router = Router();

function formatProduct(r: typeof productsTable.$inferSelect) {
  return {
    ...r,
    price: Number(r.price),
    originalPrice: r.originalPrice != null ? Number(r.originalPrice) : null,
    rating: Number(r.rating),
  };
}

function makeWidget(
  type: 'content_based' | 'collaborative' | 'hybrid',
  title: string,
  subtitle: string,
  products: (typeof productsTable.$inferSelect)[],
  reasons: string[],
) {
  return {
    type,
    title,
    subtitle,
    products: products.map((p, i) => ({
      product: formatProduct(p),
      reason: reasons[i] ?? `Top recommended ${p.category || 'product'} for you`,
    })),
  };
}

// Homepage recs: dynamic per-user session and preference profile
router.get('/recommendations/homepage', async (req, res): Promise<void> => {
  const userId = getAuthUserId(req);
  const firstName = await getFirstName(req);
  const profile = userId ? await loadUserPreferenceProfile(userId) : null;

  const allProducts = await db
    .select()
    .from(productsTable)
    .orderBy(desc(productsTable.rating))
    .limit(80);

  const topCategories = (profile?.topCategories as string[]) || [];
  const topBrands = (profile?.topBrands as string[]) || [];

  // Content-Based Widget: products matching user's top categories
  let contentProducts = allProducts.filter((p) =>
    topCategories.length > 0
      ? topCategories.includes(p.category) ||
        (topCategories.includes('Gaming') && p.department === 'Gaming')
      : ['Laptops', 'Gaming', 'Mobiles'].includes(p.category),
  );
  if (contentProducts.length < 4) {
    contentProducts = allProducts;
  }

  // Collaborative Widget: trending top-sellers & highly-rated items
  const collaborativeProducts = allProducts
    .filter((p) => p.isFeatured || p.isDeal || Number(p.rating) >= 4.4)
    .slice(0, 8);

  // Hybrid AI Preferences Widget: matching preferred brands & use case
  let hybridProducts = allProducts.filter((p) => {
    if (topBrands.length > 0 && topBrands.includes(p.brand)) return true;
    if (topCategories.length > 0 && topCategories.includes(p.category)) return true;
    return p.isFeatured || Number(p.rating) >= 4.6;
  });
  if (hybridProducts.length < 4) {
    hybridProducts = allProducts.filter((p) => p.isFeatured || Number(p.rating) >= 4.5);
  }

  const preferredCategoryName = topCategories[0] || 'Tech';
  const preferredBrandName = topBrands[0] || '';

  res.json({
    contentBased: makeWidget(
      'content_based',
      profile && topCategories.length > 0
        ? `Based on Your Interest in ${preferredCategoryName}`
        : 'Based on Your Tech Interests',
      profile && topCategories.length > 0
        ? `Personalized picks tailored to your ${preferredCategoryName.toLowerCase()} browsing & preferences`
        : 'Personalized electronics matching your browsing history',
      contentProducts.slice(0, 6),
      contentProducts.slice(0, 6).map((p) =>
        topBrands.includes(p.brand)
          ? `Matches your favorite brand ${p.brand}`
          : `Top rated in ${p.category}`,
      ),
    ),
    collaborative: makeWidget(
      'collaborative',
      'Trending Among Similar Shoppers',
      'What tech enthusiasts with similar taste are buying this week',
      collaborativeProducts.slice(0, 6),
      collaborativeProducts.slice(0, 6).map((p) =>
        p.isDeal
          ? '🔥 Trending deal this week'
          : p.isFeatured
            ? '⭐ High-demand bestseller'
            : 'Popular among verified buyers',
      ),
    ),
    hybrid: makeWidget(
      'hybrid',
      `${firstName}'s Personal AI Preferences`,
      preferredBrandName
        ? `Curated blend of ${preferredBrandName} and top-rated gear selected for you`
        : 'Curated mix of top AI recommendations tailored for you',
      hybridProducts.slice(0, 6),
      hybridProducts.slice(0, 6).map((p) =>
        topBrands.includes(p.brand)
          ? `Matches your saved ${p.brand} preference`
          : profile?.personaHint === 'gamer' && (p.category === 'Gaming' || p.department === 'Gaming')
            ? 'Optimized for high-FPS gaming'
            : `Top AI pick for ${firstName}`,
      ),
    ),
  });
});

// PDP recs: cache 3 min per product
router.get(
  '/recommendations/pdp/:productId',
  cacheMiddleware(THREE_MIN),
  async (req, res): Promise<void> => {
    const userId = getAuthUserId(req);
    const firstName = await getFirstName(req);
    const profile = userId ? await loadUserPreferenceProfile(userId) : null;
    const topBrands = (profile?.topBrands as string[]) || [];

    const rawId = Array.isArray(req.params.productId)
      ? req.params.productId[0]
      : req.params.productId;
    const parsed = GetPdpRecommendationsParams.safeParse({
      productId: parseInt(rawId, 10),
    });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [currentProduct] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, parsed.data.productId))
      .limit(1);

    const allProducts = await db
      .select()
      .from(productsTable)
      .where(ne(productsTable.id, parsed.data.productId))
      .limit(40);

    const currentCat = currentProduct?.category || '';
    const currentBrand = currentProduct?.brand || '';

    // Complementary accessories / add-ons
    const accessories = allProducts.filter((p) =>
      ['Accessories', 'Audio', 'Gaming'].includes(p.category),
    );

    // Similar alternatives in same category
    const similar = allProducts.filter((p) => p.category === currentCat);

    // AI bundles tailored to user
    const brandMatches = allProducts.filter((p) =>
      topBrands.includes(p.brand) || p.brand === currentBrand,
    );
    const bundleCandidates = brandMatches.length >= 3 ? brandMatches : allProducts.filter((p) => p.isFeatured);

    res.json({
      frequentlyBoughtTogether: makeWidget(
        'collaborative',
        'Frequently Bought Together',
        'Customers who bought this also bought',
        accessories.slice(0, 3),
        [
          'Often bought together with this item',
          'Popular accessory pair',
          'Frequently combined in customer orders',
        ],
      ),
      contentBased: makeWidget(
        'content_based',
        'Complete Your Setup',
        `Matching accessories and peripherals for ${currentProduct ? currentProduct.name : 'this item'}`,
        (accessories.length >= 3 ? accessories : allProducts).slice(0, 4),
        [
          'Plug & play compatible',
          'Color & spec matched',
          'Recommended accessory',
          'Popular companion product',
        ],
      ),
      hybrid: makeWidget(
        'hybrid',
        `${firstName}'s AI Bundle Suggestion`,
        `Curated gear to upgrade your setup`,
        bundleCandidates.slice(0, 3),
        [
          `Matches your preference profile`,
          'Complementary high-performance pick',
          'Curated specifically for you',
        ],
      ),
    });
  },
);

// Cart recs: cache 3 min
router.get(
  '/recommendations/cart',
  cacheMiddleware(THREE_MIN),
  async (req, res): Promise<void> => {
    const userId = getAuthUserId(req);
    const firstName = await getFirstName(req);
    const profile = userId ? await loadUserPreferenceProfile(userId) : null;
    const topBrands = (profile?.topBrands as string[]) || [];

    const allProducts = await db.select().from(productsTable).limit(30);

    const crossSell = allProducts.filter((p) =>
      ['Accessories', 'Audio'].includes(p.category),
    );
    const collaborative = allProducts.filter((p) => p.category === 'Accessories');
    const hybrid = allProducts.filter(
      (p) => topBrands.includes(p.brand) || p.isFeatured,
    );

    res.json({
      crossSell: makeWidget(
        'content_based',
        'Complete Your Setup',
        'Essential add-ons you might need with your cart',
        crossSell.slice(0, 4),
        [
          'Compatible accessory',
          'Great add-on for your items',
          'Frequently added to similar carts',
          'Special companion discount available',
        ],
      ),
      collaborative: makeWidget(
        'collaborative',
        'Frequently Bought Together',
        'Shoppers with a similar cart also bought these',
        collaborative.slice(0, 3),
        [
          'Trending in your segment',
          'Popular with similar carts',
          'High demand accessory',
        ],
      ),
      hybrid: makeWidget(
        'hybrid',
        `${firstName}'s Personal AI Picks`,
        'Based on your browsing and purchase history',
        hybrid.slice(0, 3),
        [
          'Matches your favorite brand',
          'Curated based on your interests',
          'Top AI recommendation',
        ],
      ),
    });
  },
);

export default router;

