import { useCallback, useEffect, useRef } from 'react';
import { useUser } from '../context/UserContext';

const SESSION_KEY = 'shopnow_session_id';

export function getOrCreateSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto.randomUUID === 'function'
          ? `anon_${crypto.randomUUID()}`
          : `anon_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `session_${Date.now()}`;
  }
}

export function useBehaviorTracking() {
  const { user, isLoggedIn } = useUser();
  const lastTrackedRef = useRef<{ [key: string]: number }>({});

  const trackEvent = useCallback(
    async (
      eventType:
        | 'view'
        | 'search'
        | 'add_to_cart'
        | 'purchase'
        | 'chatbot_query'
        | 'preference_stated',
      data: {
        productId?: number;
        category?: string;
        brand?: string;
        keyword?: string;
        metadata?: Record<string, unknown>;
      } = {},
    ) => {
      try {
        const sessionId = getOrCreateSessionId();

        // Prevent duplicate rapid-fire view events for same product in < 3 seconds
        if (eventType === 'view' && data.productId) {
          const key = `view_${data.productId}`;
          const lastTime = lastTrackedRef.current[key] || 0;
          if (Date.now() - lastTime < 3000) return;
          lastTrackedRef.current[key] = Date.now();
        }

        const token = localStorage.getItem('shopnow_auth_token');
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        await fetch('/api/preferences/event', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            sessionId,
            eventType,
            productId: data.productId,
            category: data.category,
            brand: data.brand,
            keyword: data.keyword,
            metadata: data.metadata,
          }),
        });
      } catch (err) {
        // Non-blocking telemetry
      }
    },
    [],
  );

  const trackView = useCallback(
    (productId: number, category?: string, brand?: string) => {
      void trackEvent('view', { productId, category, brand });
    },
    [trackEvent],
  );

  const trackSearch = useCallback(
    (keyword: string, category?: string) => {
      void trackEvent('search', { keyword, category });
    },
    [trackEvent],
  );

  const trackAddToCart = useCallback(
    (productId: number, category?: string, brand?: string) => {
      void trackEvent('add_to_cart', { productId, category, brand });
    },
    [trackEvent],
  );

  const trackPreference = useCallback(
    (signal: string, category?: string, brand?: string) => {
      void trackEvent('preference_stated', {
        category,
        brand,
        metadata: { signal },
      });
    },
    [trackEvent],
  );

  // Sync anonymous guest events to user account upon logging in
  useEffect(() => {
    if (isLoggedIn && user?.id) {
      const sessionId = getOrCreateSessionId();
      const token = localStorage.getItem('shopnow_auth_token');
      if (token) {
        void fetch('/api/preferences/merge-anonymous', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
          body: JSON.stringify({ sessionId }),
        });
      }
    }
  }, [isLoggedIn, user?.id]);

  return {
    trackEvent,
    trackView,
    trackSearch,
    trackAddToCart,
    trackPreference,
  };
}
