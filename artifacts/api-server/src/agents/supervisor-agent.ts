import { AgentGraph } from './agent-graph.js';
import {
  createProductSearchClarification,
  mergePendingProductSearch,
  needsProductSearchClarification,
} from './clarification-policy.js';
import { GraphRunner } from './graph-runner.js';
import { GuardrailAgent } from './guardrail-agent.js';
import { RouterAgent } from './router-agent.js';
import {
  detectCorrection,
  formatSelfCorrectionPrefix,
} from './self-correction-engine.js';
import type { AgentContext, AgentResponse } from './types.js';

// Build context-aware fallback chips based on user message content
function buildContextualFallbackChips(message: string): string[] {
  const lower = message.toLowerCase();

  if (/tv|television|smart tv/.test(lower)) {
    return ['Show me monitors', 'Show premium audio', "What's trending?"];
  }
  if (/tablet|ipad/.test(lower)) {
    return ['Show me ultrabook laptops', 'Show me premium phones'];
  }
  if (/return|refund|exchange/.test(lower)) {
    return ['Show my orders', 'Track my delivery'];
  }
  if (/compare|vs|versus/.test(lower)) {
    return ['Compare iPhone 15 vs Samsung S24', 'Show best mobiles'];
  }
  if (/mobile|phone/.test(lower)) {
    return ['Help me pick a mobile', 'Show budget phones', 'Show premium phones'];
  }
  if (/laptop/.test(lower)) {
    return ['Help me pick a laptop', 'Show budget laptops', 'Show gaming laptops'];
  }
  if (/gaming|pc|build/.test(lower)) {
    return ['Build a Gaming PC', 'Show gaming laptops'];
  }
  if (/deal|offer|sale|discount/.test(lower)) {
    return ['Show trending products', 'Show top picks for me'];
  }

  // Generic fallback chips
  return [
    'Help me pick a mobile',
    'Build a Gaming PC',
    'Show Trending Products',
    'My Orders',
  ];
}

export class SupervisorAgent {
  name = 'SupervisorAgent';

  private readonly router = new RouterAgent();
  private readonly graphRunner = new GraphRunner(new AgentGraph());
  private readonly guardrail = new GuardrailAgent();

  async execute(ctx: AgentContext): Promise<AgentResponse> {
    const correctionAnalysis = detectCorrection(ctx.message);
    if (correctionAnalysis.isCorrection) {
      console.log(
        `[SupervisorAgent] Self-correction triggered (${correctionAnalysis.correctionType}): "${ctx.message}"`,
      );
    }

    try {
      const parsed = mergePendingProductSearch(
        ctx,
        await this.router.classifyIntent(ctx),
      );

      if (
        (!parsed.intent || parsed.intent === 'unknown') &&
        (ctx.checkpoint?.activeAgent === 'gaming_build' ||
          ctx.checkpoint?.activeAgent === 'guided_advisor')
      ) {
        parsed.intent = ctx.checkpoint.activeAgent;
      }

      if (needsProductSearchClarification(ctx, parsed)) {
        console.log(
          '[SupervisorAgent] Requesting product category clarification',
        );
        return this.guardrail.finalize(
          ctx,
          createProductSearchClarification(ctx, parsed),
        );
      }

      const response = await this.graphRunner.run(ctx, parsed);
      response.checkpoint = {
        ...(ctx.checkpoint ?? { version: 1 }),
        activeAgent: parsed.intent ?? null,
        personalizationEnabled: ctx.checkpoint?.personalizationEnabled ?? false,
      };

      // If user corrected the AI, prepend self-correction acknowledgment
      if (correctionAnalysis.isCorrection && response.reply) {
        const prefix = formatSelfCorrectionPrefix(correctionAnalysis);
        if (!response.reply.startsWith('💡')) {
          response.reply = prefix + response.reply;
        }
      }

      // ── Secondary recovery: empty response guard ────────────────────────
      // If we returned no products AND a very short reply, something went wrong
      if (
        response.products?.length === 0 &&
        (!response.reply || response.reply.length < 30) &&
        !response.requiresLogin
      ) {
        console.warn(
          '[SupervisorAgent] Empty response detected — injecting recovery guidance',
        );
        response.reply =
          (response.reply || '') +
          `\n\nI may not have fully understood your request. Let me help you navigate:\n\n` +
          `Could you clarify what you're looking for? For example:\n` +
          `• **"Help me pick a mobile under ₹20,000"**\n` +
          `• **"Build a gaming PC for 1.5 lakh"**\n` +
          `• **"Show my orders"**`;
        response.followUp = buildContextualFallbackChips(ctx.message);
      }

      if (response.products?.length && !response.explanation) {
        response.explanation = {
          why: [
            'These items match the request using the product catalog and current availability.',
          ],
          tradeoffs: [
            'You can ask for a different budget, brand, or sorting preference and I will re-rank them.',
          ],
          source: 'catalog',
        };
      }

      return this.guardrail.finalize(ctx, response);
    } catch (error) {
      console.error('[SupervisorAgent] Error in execution graph:', error);

      // Fault-tolerant self-healing fallback response
      const contextualChips = buildContextualFallbackChips(ctx.message);
      const fallbackResponse: AgentResponse = {
        reply:
          '💡 **I noticed a hiccup while processing your request.** My apologies!\n\n' +
          'Could you rephrase your question? For example:\n' +
          '• **"Help me pick a mobile"** — guided recommendation\n' +
          '• **"Build me a gaming PC"** — custom PC builder\n' +
          '• **"Show laptops under ₹60,000"** — product search\n' +
          '• **"My recent orders"** — order tracking',
        products: [],
        orders: [],
        followUp: contextualChips,
        userContext: ctx.userContext
          ? {
              name: ctx.userContext.name,
              recentOrderCount: ctx.userContext.recentOrders?.length ?? 0,
              interests: ctx.userContext.interests,
            }
          : null,
      };

      return this.guardrail.finalize(ctx, fallbackResponse);
    }
  }
}
