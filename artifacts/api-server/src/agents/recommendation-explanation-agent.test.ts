import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RecommendationExplanationAgent } from './recommendation-explanation-agent.js';
import { RouterAgent } from './router-agent.js';
import type { AgentContext } from './types.js';

describe('RecommendationExplanationAgent & Rationale Grounding', () => {
  const agent = new RecommendationExplanationAgent();
  const router = new RouterAgent();

  it('classifies "why did you suggest this" questions into recommendation_explanation intent', async () => {
    const parsed1 = await router.classifyIntent({
      message: 'why did you suggest this to me?',
      userId: 1,
      userContext: {},
    });
    assert.equal(parsed1.intent, 'recommendation_explanation');

    const parsed2 = await router.classifyIntent({
      message: 'why are you recommending this product?',
      userId: 1,
      userContext: {},
    });
    assert.equal(parsed2.intent, 'recommendation_explanation');

    const parsed3 = await router.classifyIntent({
      message: 'how did you pick this for me?',
      userId: 1,
      userContext: {},
    });
    assert.equal(parsed3.intent, 'recommendation_explanation');
  });

  it('explains recommendation grounding referencing gamer persona, Samsung brand preference, and order history', async () => {
    const ctx: AgentContext = {
      message: 'Why did you suggest this setup to me?',
      userId: 101,
      userContext: {
        name: 'Shradha',
        preferenceProfile: {
          personaHint: 'gamer',
          topBrands: ['Samsung', 'AMD'],
          topCategories: ['Gaming', 'Mobiles'],
          useCases: ['High FPS Gaming'],
          priceRange: { min: 40000, max: 150000 },
          giftBuyerScore: 0,
          conversationSignals: [
            'I loved Samsung mobile from iPhone, I loved to game',
          ],
        },
        recentOrders: [
          {
            id: 88,
            totalAmount: '45000',
            status: 'delivered',
            createdAt: new Date().toISOString(),
            address: { city: 'Mumbai' },
            products: ['Samsung 27" Gaming Monitor', 'RGB Mechanical Keyboard'],
          },
        ],

        interests: ['Gaming', 'Accessories'],
      },
      history: [
        { role: 'user', content: 'Build a PC for me' },
        {
          role: 'assistant',
          content: 'Here is your custom Gaming PC: Ryzen 7 7800X3D + RTX 4070 Ti + Samsung 990 Pro NVMe SSD.',
        },
      ],
    };

    const res = await agent.execute(ctx);
    assert.ok(res.reply, 'Should produce an explanation reply');
    assert.ok(
      res.reply.toLowerCase().includes('gamer') ||
        res.reply.toLowerCase().includes('gaming') ||
        res.reply.toLowerCase().includes('samsung'),
      'Explanation should reference gaming persona or Samsung preference',
    );
    assert.ok(res.explanation, 'Should include structured explanation metadata');
  });
});
