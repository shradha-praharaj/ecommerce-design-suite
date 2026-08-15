import { Router } from "express";
import {
  eq,
  and,
  or,
  ilike,
  gte,
  lte,
  sql,
  asc,
  desc,
  count,
} from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import {
  ListProductsQueryParams,
  GetProductParams,
  SearchProductsQueryParams,
} from "@workspace/api-zod";
import { cacheMiddleware, setCacheHeaders, clearAllCache, invalidateCache } from "../middlewares/cache.js";

const FIVE_MIN = 5 * 60 * 1000;
const ONE_MIN = 60 * 1000;

const router = Router();

// Clear product response cache
router.post("/products/cache/clear", (_req, res): void => {
  clearAllCache();
  res.json({ success: true, message: "Product cache cleared" });
});

// Search results: cache 1 min (user queries vary)
router.get(
  "/products/search",
  cacheMiddleware(ONE_MIN),
  async (req, res): Promise<void> => {
    const parsed = SearchProductsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { q, category, minPrice, maxPrice, inStock, sortBy, page, limit } =
      parsed.data;
    const conditions = [];

    if (q) {
      const pattern = `%${q}%`;
      conditions.push(
        or(
          ilike(productsTable.name, pattern),
          ilike(productsTable.brand, pattern),
          ilike(productsTable.category, pattern),
        ),
      );
    }
    if (category) conditions.push(eq(productsTable.category, category));

    // New: department and componentType filtering (does not break existing callers)
    const department = req.query.department as string | undefined;
    const componentType = req.query.componentType as string | undefined;
    if (department) conditions.push(eq(productsTable.department, department));
    if (componentType)
      conditions.push(eq(productsTable.componentType, componentType));
    if (minPrice != null)
      conditions.push(
        gte(sql`CAST(${productsTable.price} AS numeric)`, minPrice),
      );
    if (maxPrice != null)
      conditions.push(
        lte(sql`CAST(${productsTable.price} AS numeric)`, maxPrice),
      );
    if (inStock != null) conditions.push(eq(productsTable.inStock, inStock));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(productsTable)
      .where(whereClause);

    // Determine sort order
    let orderBy;
    switch (sortBy) {
      case "price_asc":
        orderBy = asc(productsTable.price);
        break;
      case "price_desc":
        orderBy = desc(productsTable.price);
        break;
      case "rating":
        orderBy = desc(productsTable.rating);
        break;
      case "newest":
        orderBy = desc(productsTable.createdAt);
        break;
      default:
        // relevance — if there's a query, sort by name match; otherwise by featured
        orderBy = desc(productsTable.isFeatured);
        break;
    }

    const offset = (page - 1) * limit;
    const rows = await db
      .select()
      .from(productsTable)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    res.json({
      products: rows.map((r) => ({
        ...r,
        price: Number(r.price),
        originalPrice: r.originalPrice != null ? Number(r.originalPrice) : null,
        rating: Number(r.rating),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  },
);

// Categories rarely change: cache 5 min
router.get(
  "/products/categories",
  cacheMiddleware(FIVE_MIN),
  async (_req, res): Promise<void> => {
    const rows = await db
      .select({
        name: productsTable.category,
        count: count(),
      })
      .from(productsTable)
      .groupBy(productsTable.category)
      .orderBy(desc(count()));

    res.json(rows);
  },
);

// Product list: cache 2 min
router.get(
  "/products",
  cacheMiddleware(2 * ONE_MIN),
  async (req, res): Promise<void> => {
    const parsed = ListProductsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { category, featured, limit } = parsed.data;
    const conditions = [];
    if (category) conditions.push(eq(productsTable.category, category));
    if (featured === true) conditions.push(eq(productsTable.isFeatured, true));

    const rows = await db
      .select()
      .from(productsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(limit ?? 50);

    res.json(
      rows.map((r) => ({
        ...r,
        price: Number(r.price),
        originalPrice: r.originalPrice != null ? Number(r.originalPrice) : null,
        rating: Number(r.rating),
      })),
    );
  },
);

// Deals: cache 2 min
router.get(
  "/products/deals",
  cacheMiddleware(2 * ONE_MIN),
  async (req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.isDeal, true))
      .limit(8);

    res.json(
      rows.map((r) => ({
        ...r,
        price: Number(r.price),
        originalPrice: r.originalPrice != null ? Number(r.originalPrice) : null,
        rating: Number(r.rating),
      })),
    );
  },
);

// Popular products: cache 2 min
// Returns top-rated products filtered by review count (ensures true popularity)
router.get(
  "/products/popular",
  cacheMiddleware(2 * ONE_MIN),
  async (req, res): Promise<void> => {
    const limit = Math.min(parseInt(req.query.limit as string) || 5, 10);
    const minReviews = parseInt(req.query.minReviews as string) || 3;

    const rows = await db
      .select()
      .from(productsTable)
      .where(
        and(
          eq(productsTable.inStock, true),
          gte(sql`CAST(${productsTable.reviewCount} AS numeric)`, minReviews),
        ),
      )
      .orderBy(desc(productsTable.rating), desc(productsTable.reviewCount))
      .limit(limit);

    const products = rows.map((r) => {
      const ratingValue = Number(r.rating);
      // Determine reason based on rating tier
      let reason = "";
      if (ratingValue >= 4.7) {
        reason = `🏆 Highly acclaimed (${r.reviewCount} verified reviews)`;
      } else if (ratingValue >= 4.3) {
        reason = `⭐ Customer favorite (${r.reviewCount} great reviews)`;
      } else if (ratingValue >= 4.0) {
        reason = `✓ Well-reviewed (${r.reviewCount} positive reviews)`;
      } else {
        reason = `📊 Popular choice (${r.reviewCount} reviews)`;
      }

      return {
        id: r.id,
        name: r.name,
        brand: r.brand,
        category: r.category,
        price: Number(r.price),
        originalPrice: r.originalPrice != null ? Number(r.originalPrice) : null,
        rating: ratingValue,
        reviewCount: r.reviewCount,
        imageUrl: r.imageUrl,
        reason,
      };
    });

    res.json({
      success: true,
      data: {
        title: "What's Popular Right Now 🔥",
        subtitle: "Based on customer ratings and reviews",
        products,
        summary: `These are our most popular products with real customer reviews. Sorted by rating (${products[0]?.rating.toFixed(1)} out of 5 stars on average).`,
      },
    });
  },
);

// Single product: cache 2 min
router.get(
  "/products/:id",
  cacheMiddleware(2 * ONE_MIN),
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const parsed = GetProductParams.safeParse({ id: parseInt(rawId, 10) });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, parsed.data.id))
      .limit(1);

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    res.json({
      ...product,
      price: Number(product.price),
      originalPrice:
        product.originalPrice != null ? Number(product.originalPrice) : null,
      rating: Number(product.rating),
    });
  },
);

export default router;
