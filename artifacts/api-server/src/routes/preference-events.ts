import { Router } from 'express';
import { getAuthUserId } from '../lib/crypto.js';
import {
  trackUserBehaviorEvent,
  loadUserPreferenceProfile,
  saveUserConversationSignal,
  mergeAnonymousEvents,
} from '../agents/user-preference-engine.js';

export const preferenceEventsRouter = Router();

/**
 * Track a behavior event (page view, search query, add to cart, etc.)
 */
preferenceEventsRouter.post('/event', async (req, res): Promise<void> => {
  const userId = getAuthUserId(req);
  const { sessionId, eventType, productId, category, brand, keyword, metadata } =
    req.body;

  if (!sessionId || !eventType) {
    res.status(400).json({ message: 'sessionId and eventType are required' });
    return;
  }

  await trackUserBehaviorEvent({
    userId: userId || null,
    sessionId: String(sessionId),
    eventType,
    productId: productId ? Number(productId) : null,
    category: category ? String(category) : null,
    brand: brand ? String(brand) : null,
    keyword: keyword ? String(keyword) : null,
    metadata: metadata || null,
  });

  res.status(200).json({ status: 'ok' });
});

/**
 * Get computed preference profile for authenticated user
 */
preferenceEventsRouter.get('/profile', async (req, res): Promise<void> => {
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Login required' });
    return;
  }

  const profile = await loadUserPreferenceProfile(userId);
  res.status(200).json({ profile });
});

/**
 * Save an explicit conversation signal into user preferences
 */
preferenceEventsRouter.post(
  '/conversation-signal',
  async (req, res): Promise<void> => {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ message: 'Login required' });
      return;
    }

    const { signal, category, brand } = req.body;
    if (!signal || typeof signal !== 'string') {
      res.status(400).json({ message: 'signal is required' });
      return;
    }

    await saveUserConversationSignal(userId, signal, category, brand);
    res.status(200).json({ status: 'ok' });
  },
);

/**
 * Merge guest events into newly logged-in user profile
 */
preferenceEventsRouter.post(
  '/merge-anonymous',
  async (req, res): Promise<void> => {
    const userId = getAuthUserId(req);
    const { sessionId } = req.body;

    if (!userId || !sessionId) {
      res.status(400).json({ message: 'userId and sessionId are required' });
      return;
    }

    await mergeAnonymousEvents(String(sessionId), userId);
    res.status(200).json({ status: 'ok' });
  },
);
