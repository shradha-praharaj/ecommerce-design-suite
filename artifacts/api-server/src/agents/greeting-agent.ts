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
    const displayName = userContext.name || '';
    const followUp: string[] = [];

    let reply = parsed.reply;

    if (!reply) {
      if (userId) {
        // Case 1: Incomplete / Left-out session recovery
        if (userContext.incompleteCheckpoint) {
          const inc = userContext.incompleteCheckpoint;
          const greetingName = displayName ? `${displayName}` : 'there';

          if (
            inc.activeAgent === 'GamingBuildAdvisorAgent' ||
            inc.goal.includes('pc_build') ||
            inc.goal.includes('gaming')
          ) {
            const budgetText = inc.budgetMax
              ? ` (around ₹${Number(inc.budgetMax).toLocaleString('en-IN')})`
              : '';
            reply = `Welcome back, ${greetingName}! 👋\n\nI noticed we were previously crafting **${inc.summaryText}**${budgetText}. Would you like to pick up where we left off, review the components, or explore something new today?`;
            followUp.push('▶ Continue where I left off');
            followUp.push('Review build components');
            followUp.push('Start fresh search');
            followUp.push('Top picks for me');
          } else {
            reply = `Welcome back, ${greetingName}! 👋\n\nLast time, we were exploring **${inc.summaryText}**. Would you like to continue looking into that, or is there something else you'd like to check out today?`;
            followUp.push('▶ Continue where I left off');
            followUp.push('Start fresh search');
            followUp.push('Top picks for me');
          }
        }
        // Case 2: Personalized welcome with profile insights
        else if (userContext.preferenceProfile) {
          const prof = userContext.preferenceProfile;
          const favoriteBrand = prof.topBrands[0];
          const favoriteCategory = prof.topCategories[0];

          if (favoriteCategory && favoriteBrand) {
            reply = displayName
              ? `Welcome back, ${displayName}! 👋 Ready to explore new **${favoriteBrand}** releases and the latest **${favoriteCategory}** deals? Let me know what you're looking for!`
              : `Welcome back! 👋 Ready to explore new **${favoriteBrand}** releases and the latest **${favoriteCategory}** deals? Let me know what you're looking for!`;
          } else if (favoriteCategory) {
            reply = displayName
              ? `Welcome back, ${displayName}! 👋 Looking for the latest in **${favoriteCategory}**, or would you like me to find deals tailored to your setup?`
              : `Welcome back! 👋 Looking for the latest in **${favoriteCategory}**, or would you like me to find deals tailored to your setup?`;
          } else {
            reply = displayName
              ? `Welcome back, ${displayName}! 👋 How can I assist you with your tech shopping today?`
              : `Welcome back! 👋 How can I assist you with your tech shopping today?`;
          }

          if (favoriteCategory) {
            followUp.push(`Best ${favoriteCategory} deals`);
          }
          if (favoriteBrand) {
            followUp.push(`Latest from ${favoriteBrand}`);
          }
          if (prof.personaHint === 'gamer') {
            followUp.push('Build a Gaming PC for me');
          }
          followUp.push('My recent orders');
          followUp.push('Top picks for me');
        }
        // Case 3: Standard logged-in user
        else if (userContext.interests?.length) {
          const interests = userContext.interests.join(', ');
          reply = displayName
            ? `Welcome back, ${displayName}! 👋 Based on your interests in **${interests}**, I can help you find deals, compare specs, or build your dream setup. What can I do for you today?`
            : `Welcome back! 👋 Based on your interests in **${interests}**, I can help you find deals, compare specs, or build your dream setup. What can I do for you today?`;
          followUp.push(`New ${userContext.interests[0]} deals`);
          followUp.push('My recent orders');
          followUp.push('Top picks for me');
        } else {
          reply = displayName
            ? `Welcome back, ${displayName}! 👋 How can I assist you with your shopping today?`
            : `Welcome back! 👋 How can I assist you with your shopping today?`;
          followUp.push('Top picks for me');
          followUp.push('Best laptops');
          followUp.push('Mobiles under ₹30,000');
          followUp.push('My recent orders');
        }
      } else {
        reply = `Hello! 👋 I'm your ShopNow AI assistant. I can help you find the best deals on laptops, mobiles, cameras & custom PC builds!\n\n💡 **Tip:** Log in to unlock personalized recommendations, build history, and instant checkout.`;
        followUp.push('Show me mobiles');
        followUp.push('Best laptops');
        followUp.push('Build a PC');
        followUp.push("Today's deals");
      }
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

