import { Router } from 'express';
import { eq, desc, avg, count, and } from 'drizzle-orm';
import { db, reviewsTable, productsTable } from '@workspace/db';
import { cacheMiddleware, invalidateCache } from '../middlewares/cache.js';
import { getAuthUserId } from '../lib/crypto.js';

const TWO_MIN = 2 * 60 * 1000;
const router = Router();

async function updateProductRatingStats(productId: number): Promise<void> {
  const [stats] = await db
    .select({
      avgRating: avg(reviewsTable.rating),
      cnt: count(),
    })
    .from(reviewsTable)
    .where(eq(reviewsTable.productId, productId));

  const avgRatingValue = stats?.avgRating
    ? Math.round(Number(stats.avgRating) * 10) / 10
    : 0;
  const reviewCount = stats?.cnt ? Number(stats.cnt) : 0;

  await db
    .update(productsTable)
    .set({
      rating: String(avgRatingValue),
      reviewCount,
    })
    .where(eq(productsTable.id, productId));
}

// GET /products/:id/reviews
// Reviews: cache 2 min
router.get(
  '/products/:id/reviews',
  cacheMiddleware(TWO_MIN),
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const productId = parseInt(rawId, 10);
    if (isNaN(productId)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }

    const reviews = await db
      .select()
      .from(reviewsTable)
      .where(eq(reviewsTable.productId, productId))
      .orderBy(desc(reviewsTable.createdAt));

    // Calculate rating distribution
    const distribution = [0, 0, 0, 0, 0]; // index 0 = 1 star, index 4 = 5 stars
    let totalRating = 0;
    for (const r of reviews) {
      distribution[r.rating - 1]++;
      totalRating += r.rating;
    }
    const averageRating = reviews.length > 0 ? totalRating / reviews.length : 0;

    res.json({
      reviews,
      stats: {
        total: reviews.length,
        averageRating: Math.round(averageRating * 10) / 10,
        distribution,
      },
    });
  },
);

// POST /products/:id/reviews
router.post('/products/:id/reviews', async (req, res): Promise<void> => {
  try {
    const rawId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const productId = parseInt(rawId, 10);
    const userId = getAuthUserId(req);

    console.log('[POST /reviews] Debug:', {
      productId,
      userId,
      sessionCookie: req.cookies?.session_user_id,
      body: req.body,
    });

    if (!userId) {
      res.status(401).json({ error: 'Must be logged in to write a review' });
      return;
    }

    if (isNaN(productId)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }

    // Verify product exists
    const [product] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.id, productId));

    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const [existingReview] = await db
      .select({ id: reviewsTable.id })
      .from(reviewsTable)
      .where(
        and(
          eq(reviewsTable.productId, productId),
          eq(reviewsTable.userId, userId),
        ),
      )
      .limit(1);

    if (existingReview) {
      res.status(409).json({
        error:
          'You already reviewed this product. Please edit your existing review instead.',
      });
      return;
    }

    const { rating, title, comment, userName } = req.body;

    if (
      !rating ||
      rating < 1 ||
      rating > 5 ||
      !title ||
      !comment ||
      !userName
    ) {
      res.status(400).json({
        error: 'rating (1-5), title, comment, and userName are required',
      });
      return;
    }

    const [review] = await db
      .insert(reviewsTable)
      .values({
        productId,
        userId,
        userName,
        rating: Math.round(rating),
        title,
        comment,
      })
      .returning();

    console.log('[POST /reviews] Created review:', {
      reviewId: review.id,
      userId,
      productId,
      userName,
    });

    await updateProductRatingStats(productId);

    // Invalidate cached reviews and product data for this product
    invalidateCache(`/api/products/${productId}/reviews`);
    invalidateCache(`/api/products/${productId}`);
    invalidateCache('/api/products/popular');

    res.status(201).json(review);
  } catch (err: any) {
    const errorCode = err?.code || err?.cause?.code;
    if (errorCode === '23505') {
      res.status(409).json({
        error:
          'You already reviewed this product. Please edit your existing review instead.',
      });
      return;
    }
    console.error('Error creating review:', err);
    res.status(500).json({ error: err?.message || 'Failed to create review' });
  }
});

// PUT /products/:id/reviews
// Edit currently logged-in user's existing review for this product
// Requires review ID in request body to identify which review to update
router.put('/products/:id/reviews', async (req, res): Promise<void> => {
  try {
    const rawId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const productId = parseInt(rawId, 10);
    const userId = getAuthUserId(req);

    console.log('[PUT /reviews] Debug:', {
      productId,
      userId,
      sessionCookie: req.cookies?.session_user_id,
      bodyReviewId: req.body?.reviewId,
    });

    if (!userId) {
      res.status(401).json({ error: 'Must be logged in to edit a review' });
      return;
    }

    if (isNaN(productId)) {
      res.status(400).json({ error: 'Invalid product ID' });
      return;
    }

    const { rating, title, comment, userName, reviewId } = req.body;

    if (!reviewId) {
      res.status(400).json({ error: 'reviewId is required' });
      return;
    }

    if (
      !rating ||
      rating < 1 ||
      rating > 5 ||
      !title ||
      !comment ||
      !userName
    ) {
      res.status(400).json({
        error: 'rating (1-5), title, comment, and userName are required',
      });
      return;
    }

    // Find the review by ID and verify it belongs to this user and product
    const [existingReview] = await db
      .select({
        id: reviewsTable.id,
        userId: reviewsTable.userId,
        productId: reviewsTable.productId,
      })
      .from(reviewsTable)
      .where(eq(reviewsTable.id, reviewId))
      .limit(1);

    console.log('[PUT /reviews] Found review:', {
      existingReview,
      currentUserId: userId,
    });

    if (
      !existingReview ||
      existingReview.userId !== userId ||
      existingReview.productId !== productId
    ) {
      res.status(404).json({
        error:
          'No existing review found. You can only update your own reviews.',
      });
      return;
    }

    const [updatedReview] = await db
      .update(reviewsTable)
      .set({
        rating: Math.round(rating),
        title,
        comment,
        userName,
      })
      .where(eq(reviewsTable.id, reviewId))
      .returning();

    console.log('[PUT /reviews] Updated review:', {
      reviewId: updatedReview.id,
      userId,
      productId,
    });

    await updateProductRatingStats(productId);

    invalidateCache(`/api/products/${productId}/reviews`);
    invalidateCache(`/api/products/${productId}`);
    invalidateCache('/api/products/popular');

    res.json(updatedReview);
  } catch (err: any) {
    const errorCode = err?.code || err?.cause?.code;
    if (errorCode === '23505') {
      res.status(409).json({
        error:
          'You already reviewed this product. Cannot create duplicate reviews.',
      });
      return;
    }
    console.error('Error updating review:', err);
    res.status(500).json({ error: err?.message || 'Failed to update review' });
  }
});

export { router as reviewsRouter };
