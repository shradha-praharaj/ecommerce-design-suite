import type {
  Agent,
  AgentContext,
  AgentResponse,
  ParsedIntent,
} from './types.js';

export class GreetingAgent implements Agent {
  name = 'GreetingAgent';

  async execute(
    ctx: AgentContext,
    parsed: ParsedIntent,
  ): Promise<AgentResponse> {
    const { userContext, userId } = ctx;

    let reply = parsed.reply;
    if (!reply) {
      if (userId) {
        const displayName = userContext.name || '';
        if (userContext.interests?.length) {
          const interests = userContext.interests.join(', ');
          reply = displayName
            ? `Welcome back, ${displayName}! 👋 Great to see you again. Based on your interests in **${interests}**, I can help you find deals or explore new products. What can I do for you today?`
            : `Welcome back! 👋 Based on your interests in **${interests}**, I can help you find deals or explore new products. What can I do for you today?`;
        } else {
          reply = displayName
            ? `Welcome back, ${displayName}! 👋 How can I assist you with your shopping today?`
            : `Welcome back! 👋 How can I assist you with your shopping today?`;
        }
      } else {
        reply = `Hello! 👋 I'm your ShopNow AI assistant. I can help you find the best deals on laptops, mobiles, cameras & more!\n\n💡 **Tip:** Log in to unlock personalised recommendations, order tracking, and saved addresses.`;
      }
    }

    // Generate smart follow-ups based on user context
    const followUp: string[] = [];
    if (userId) {
      if (userContext.interests?.length) {
        followUp.push(`New ${userContext.interests[0]} deals`);
      }
      if (userContext.purchasedBrands?.length) {
        followUp.push(`Latest from ${userContext.purchasedBrands[0]}`);
      }
      followUp.push(`My recent orders`);
      followUp.push(`Top picks for me`);
    } else {
      followUp.push(`Show me mobiles`);
      followUp.push(`Best laptops`);
      followUp.push(`Today's deals`);
    }

    return {
      reply,
      products: [],
      orders: [],
      followUp: followUp.slice(0, 4),
      userContext: userId
        ? {
            name: userContext.name,
            recentOrderCount: userContext.recentOrders?.length ?? 0,
            interests: userContext.interests,
          }
        : null,
    };
  }
}
