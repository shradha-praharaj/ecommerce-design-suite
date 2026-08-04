import { Router } from "express";
import { ne, eq } from "drizzle-orm";
import { db, productsTable, usersTable } from '@workspace/db';
import { GetPdpRecommendationsParams } from "@workspace/api-zod";
import { cacheMiddleware } from '../middlewares/cache.js';
import { getAuthUserId } from '../lib/crypto.js';

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
  type: "content_based" | "collaborative" | "hybrid",
  title: string,
  subtitle: string,
  products: typeof productsTable.$inferSelect[],
  reasons: string[]
) {
  return {
    type,
    title,
    subtitle,
    products: products.map((p, i) => ({
      product: formatProduct(p),
      reason: reasons[i] ?? "Recommended for you",
    })),
  };
}

// Homepage recs: dynamic per-user session
router.get("/recommendations/homepage", async (req, res): Promise<void> => {
  const firstName = await getFirstName(req);
  const allProducts = await db.select().from(productsTable).limit(50);

  const laptopsAndAccessories = allProducts.filter((p) =>
    ["Laptops", "Accessories", "Gaming"].includes(p.category) || p.department === "Gaming"
  );
  const trending = allProducts.filter((p) =>
    ["Mobiles", "Audio", "Accessories"].includes(p.category)
  );
  const hybrid = allProducts.filter((p) => p.isFeatured || Number(p.rating) >= 4.5);

  res.json({
    contentBased: makeWidget(
      'content_based',
      'Based on Your Tech Interests',
      'Personalized electronics matching your browsing history',
      (laptopsAndAccessories.length >= 4 ? laptopsAndAccessories : allProducts).slice(0, 6),
      [
        'Similar to your browsing',
        'Matches your tech stack',
        'Frequently viewed together',
        'Accessory match',
        'Top choice for you',
        'Recommended based on history',
      ],
    ),
    collaborative: makeWidget(
      'collaborative',
      'Trending Among Similar Shoppers',
      'What tech enthusiasts like you are buying this week',
      (trending.length >= 4 ? trending : allProducts).slice(0, 6),
      [
        'Trending in your segment',
        'Popular this week',
        'High demand product',
        'People like you bought this',
        'Top seller this month',
        'Highly rated by buyers',
      ],
    ),
    hybrid: makeWidget(
      'hybrid',
      `${firstName}'s Personal AI Preferences`,
      'Curated mix of top AI recommendations tailored for you',
      (hybrid.length >= 4 ? hybrid : allProducts).slice(0, 6),
      [
        'Editorial pick + your history',
        'Trending + personalized for you',
        'Top rated for your profile',
        `Curated specifically for ${firstName}`,
        'Matches your saved preferences',
        'Top AI recommendation',
      ],
    ),
  });
});

// PDP recs: cache 3 min per product
router.get("/recommendations/pdp/:productId", cacheMiddleware(THREE_MIN), async (req, res): Promise<void> => {
  const firstName = await getFirstName(req);
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

  const allProducts = await db
    .select()
    .from(productsTable)
    .where(ne(productsTable.id, parsed.data.productId))
    .limit(20);

  const accessories = allProducts.filter((p) =>
    ["Accessories", "Audio"].includes(p.category)
  );
  const similar = allProducts.filter((p) => p.category === "Laptops");
  const featured = allProducts.filter((p) => p.isFeatured);

  res.json({
    frequentlyBoughtTogether: makeWidget(
      'collaborative',
      'Frequently Bought Together',
      'Customers who bought this also bought',
      accessories.slice(0, 3),
      [
        'Often bought together',
        'Popular add-on',
        'Frequently paired with this',
      ],
    ),
    contentBased: makeWidget(
      'content_based',
      'Complete Your Setup',
      "Accessories matching this product's specs and color",
      accessories.slice(0, 4),
      [
        'USB-C compatible',
        'Color matched',
        'Spec compatible',
        'Frequently used together',
      ],
    ),
    hybrid: makeWidget(
      'hybrid',
      `${firstName}'s AI Bundle Suggestion`,
      "Upgrading for work? Here's your kit",
      featured.slice(0, 3),
      [
        'Editorial pick + your history',
        'Trending + your preferences',
        'Curated for your work style',
      ],
    ),
  });
});

// Cart recs: cache 3 min
router.get("/recommendations/cart", cacheMiddleware(THREE_MIN), async (req, res): Promise<void> => {
  const firstName = await getFirstName(req);
  const allProducts = await db.select().from(productsTable).limit(20);

  const crossSell = allProducts.filter((p) =>
    ["Accessories", "Audio"].includes(p.category)
  );
  const collaborative = allProducts.filter((p) => p.category === "Accessories");
  const hybrid = allProducts.filter((p) => p.isFeatured);

  res.json({
    crossSell: makeWidget(
      'content_based',
      'Complete Your Setup',
      'You might also need these with your cart',
      crossSell.slice(0, 4),
      [
        'Pairs with Dell XPS 15',
        'Compatible accessory',
        'Great with your laptop',
        'Often added to similar carts',
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
        'Limited stock — popular item',
      ],
    ),
    hybrid: makeWidget(
      'hybrid',
      `${firstName}'s Personal AI Picks`,
      'Based on your browsing and purchase history',
      hybrid.slice(0, 3),
      ['You viewed this', 'Trending in your segment', 'Editorial pick'],
    ),
  });
});

export default router;
