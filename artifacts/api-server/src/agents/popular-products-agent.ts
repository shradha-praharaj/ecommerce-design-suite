import { Agent, AgentContext, AgentResponse, ParsedIntent } from './types';

interface PopularProduct {
  id: number;
  name: string;
  brand: string;
  category: string;
  price: number;
  originalPrice?: number;
  rating: number;
  reviewCount: number;
  imageUrl?: string;
  reason: string;
}

interface PopularProductsResponse {
  success: boolean;
  data?: {
    title: string;
    subtitle: string;
    products: PopularProduct[];
    summary: string;
  };
  error?: string;
}

export class PopularProductsAgent implements Agent {
  name = 'PopularProductsAgent';

  async execute(
    ctx: AgentContext,
    _parsed: ParsedIntent,
  ): Promise<AgentResponse> {
    try {
      // Fetch popular products from API
      const apiBaseUrl =
        process.env.API_BASE_URL ||
        `http://localhost:${process.env.PORT || '5000'}`;
      const response = await fetch(
        `${apiBaseUrl}/api/products/popular?limit=5&minReviews=3`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        return {
          reply:
            'Sorry, I could not fetch popular products right now. Please try again later.',
          products: [],
          orders: [],
          userContext: ctx.userContext
            ? { recentOrderCount: ctx.userContext.recentOrders?.length || 0 }
            : null,
        };
      }

      const data = (await response.json()) as PopularProductsResponse;

      if (!data.success || !data.data?.products) {
        return {
          reply:
            'Sorry, I could not fetch popular products right now. Please try again later.',
          products: [],
          orders: [],
          userContext: ctx.userContext
            ? { recentOrderCount: ctx.userContext.recentOrders?.length || 0 }
            : null,
        };
      }

      const { title, subtitle, products, summary } = data.data;

      // Format response for AI chat
      let formattedReply = `## 🔥 ${title}\n\n${subtitle}\n\n`;

      products.forEach((product: PopularProduct, index: number) => {
        const stars = '⭐'.repeat(Math.round(product.rating));
        const discount = product.originalPrice
          ? ` (${(((product.originalPrice - product.price) / product.originalPrice) * 100).toFixed(0)}% off)`
          : '';
        formattedReply += `**${index + 1}. ${product.name}** by ${product.brand}\n`;
        formattedReply += `   ${stars} ${product.rating.toFixed(1)}/5 (${product.reviewCount} reviews)\n`;
        formattedReply += `   💰 ₹${product.price.toLocaleString()}${discount}\n`;
        formattedReply += `   📌 ${product.reason}\n\n`;
      });

      formattedReply += `\n${summary}\n\n**Would you like more details about any of these products, or shall I help you with something else?** 🛒`;

      return {
        reply: formattedReply,
        products: products as any[],
        orders: [],
        followUp: products.map(
          (p: PopularProduct) => `Tell me more about ${p.name}`,
        ),
        explanation: {
          why: [
            'Popularity was explicitly requested, so results use listed ratings and review counts.',
            'Only products currently marked in stock were included.',
          ],
          tradeoffs: [
            'Popularity is not the same as personal fit; ask for a goal or budget to re-rank.',
          ],
          source: 'catalog',
        },
        userContext: ctx.userContext
          ? { recentOrderCount: ctx.userContext.recentOrders?.length || 0 }
          : null,
      };
    } catch (error) {
      console.error('PopularProductsAgent error:', error);
      return {
        reply:
          'Sorry, I encountered an error while fetching popular products. Would you like to search for something specific instead?',
        products: [],
        orders: [],
        userContext: ctx.userContext
          ? { recentOrderCount: ctx.userContext.recentOrders?.length || 0 }
          : null,
      };
    }
  }
}
