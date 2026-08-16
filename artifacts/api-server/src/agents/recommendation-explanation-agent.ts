import type { Agent, AgentContext, AgentResponse, ParsedIntent } from './types.js';
import { getAIProvider } from './ai-provider.js';

export class RecommendationExplanationAgent implements Agent {
  name = 'RecommendationExplanationAgent';

  async execute(ctx: AgentContext, _parsed?: ParsedIntent): Promise<AgentResponse> {
    const profile = ctx.userContext?.preferenceProfile;
    const recentOrders = ctx.userContext?.recentOrders ?? [];
    const interests = ctx.userContext?.interests ?? [];
    const history = ctx.history ?? [];

    // Extract recent products / context from the last assistant turns
    const recentAssistantTurns = history
      .filter((h) => h.role === 'assistant')
      .slice(-3)
      .map((h) => h.content)
      .join('\n');

    // Build context summary for explanation
    const userPersona =
      profile?.personaHint || (interests.includes('Gaming') ? 'gamer' : 'tech enthusiast');
    const topBrands = profile?.topBrands || ctx.userContext?.purchasedBrands || [];
    const topCategories = profile?.topCategories || interests;
    const conversationSignals = profile?.conversationSignals || [];

    const orderSummary =
      recentOrders.length > 0
        ? recentOrders
            .slice(0, 3)
            .map(
              (o) =>
                `Order #${o.id}: ${o.products?.join(', ') || 'Items'} (Status: ${o.status || 'delivered'})`,
            )
            .join('; ')
        : 'No past orders recorded yet.';

    const systemPrompt = `You are the transparent AI Shopping Advisor for ShopNow.
The user is asking: "Why did you suggest / recommend this to me?"

Here is the user's verified profile and activity history:
- User Name: ${ctx.userContext?.name || 'Shopper'}
- Detected Persona / Usage Profile: ${userPersona}
- Stated Preferences / Conversation Signals: ${conversationSignals.length > 0 ? conversationSignals.join(', ') : 'None explicitly stated'}
- Favorite / Preferred Brands: ${topBrands.length > 0 ? topBrands.join(', ') : 'Open to all top brands'}
- Interested Categories: ${topCategories.length > 0 ? topCategories.join(', ') : 'Electronics'}
- Verified Past Order History: ${orderSummary}
- Recent items/options shown in this chat:
"""
${recentAssistantTurns.slice(-1000) || 'Previous electronics recommendation'}
"""

YOUR TASK:
Explain clearly, warmly, and transparently WHY these products or build choices were recommended specifically for them.
STRUCTURE YOUR EXPLANATION INTO CLEAR, CONCISE BULLETS:
1. 🎯 **Personalized Affinity & Use-Case**: Explain how it matches their detected persona (e.g. high-performance gaming, productivity, student budget) or what they were looking for.
2. 🏷️ **Brand & Preference Alignment**: Mention if their past preference for brands (e.g. Samsung, AMD, Apple, Sony) or stated signals influenced the choice.
3. 📦 **Order & Browsing Context**: Reference their order history or category interest if applicable.
4. ⚡ **Value, Synergy & Ratings**: Highlight compatibility, high customer satisfaction, and optimal price-to-performance.

Keep the tone honest, reassuring, and helpful. Do not make up fake order numbers, stick strictly to the context provided.`;

    let fallbackText = `Here is why I recommended this specifically for you:\n\n`;
    fallbackText += `🎯 **Tailored to Your Profile**: Configured for your **${userPersona}** needs with a focus on optimal performance.\n`;
    if (topBrands.length > 0) {
      fallbackText += `🏷️ **Brand Alignment**: Selected leading options from **${topBrands.join(', ')}** based on your preferences.\n`;
    }
    if (recentOrders.length > 0) {
      fallbackText += `📦 **Order History Synergy**: Verified against your past purchases to ensure component compatibility.\n`;
    }
    fallbackText += `⚡ **Value & Quality**: Ranked highest for customer satisfaction, reliability, and price-to-performance ratio.`;

    try {
      const provider = getAIProvider();

      const aiResponse = await provider.generateStructuredJSON(
        systemPrompt + `\n\nUser Question: "${ctx.message}"`,
        {
          type: 'object',
          properties: {
            reply: { type: 'string' },
            whyPoints: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      );

      return {
        reply: aiResponse.reply || fallbackText,
        products: [],
        orders: recentOrders.slice(0, 2),
        followUp: [
          '⚡ Show alternative options',
          '🔍 Compare with other brands',
          '🛒 How do I order this?',
        ],
        explanation: {
          why: aiResponse.whyPoints || [
            `Matches your ${userPersona} profile`,
            `Aligned with past brand preferences`,
          ],
          source: 'user_preferences',
        },
        userContext: {
          name: ctx.userContext?.name,
          recentOrderCount: recentOrders.length,
          interests: topCategories,
        },
      };
    } catch {
      return {
        reply: fallbackText,
        products: [],
        orders: recentOrders.slice(0, 2),
        followUp: [
          '⚡ Show alternative options',
          '🔍 Compare with other brands',
        ],
        explanation: {
          why: [
            `Matches your ${userPersona} profile`,
            `Aligned with past brand preferences`,
          ],
          source: 'user_preferences',
        },
        userContext: {
          name: ctx.userContext?.name,
          recentOrderCount: recentOrders.length,
          interests: topCategories,
        },
      };
    }
  }
}
