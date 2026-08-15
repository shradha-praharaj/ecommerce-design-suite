import type { AgentContext, AgentResponse } from './types.js';

export class GuardrailAgent {
  name = 'GuardrailAgent';

  finalize(ctx: AgentContext, response: AgentResponse): AgentResponse {
    const products = Array.isArray(response.products) ? response.products : [];
    const orders = Array.isArray(response.orders) ? response.orders : [];

    // Calculate total value of recommended products
    const totalValue = products.reduce((sum, p) => {
      const price = Number(p.price) || 0;
      return sum + price;
    }, 0);

    const isHighValue = totalValue > 50000;

    let finalReply =
      typeof response.reply === 'string' && response.reply.trim()
        ? response.reply
        : 'I could not complete that request. Please try again.';

    // Ensure non-empty response
    if (finalReply.length < 5) {
      finalReply = 'Here are the matching options from our catalog:';
    }

    return {
      ...response,
      reply: finalReply,
      products,
      orders,
      isAIGenerated: true,
      requiresHumanReview: isHighValue || response.requiresHumanReview,
      followUp: Array.isArray(response.followUp)
        ? response.followUp
        : undefined,
      userContext:
        response.userContext ??
        (ctx.userId
          ? {
              name: ctx.userContext.name,
              recentOrderCount: ctx.userContext.recentOrders?.length ?? 0,
              interests: ctx.userContext.interests,
            }
          : null),
    };
  }
}
