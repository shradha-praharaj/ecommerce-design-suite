import { GuardrailAgent } from '../../guardrail-agent.js';
import { formatSelfCorrectionPrefix } from '../../self-correction-engine.js';
import type { AgentResponse } from '../../types.js';
import type { ChatbotStateType, ChatbotStateUpdate } from '../state.js';

const guardrail = new GuardrailAgent();

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

export async function guardrailNode(
  state: ChatbotStateType,
): Promise<ChatbotStateUpdate> {
  const ctx = {
    message: state.message,
    userId: state.userId,
    userContext: state.userContext,
    history: state.history,
    checkpoint: state.checkpoint ?? undefined,
  };

  let response: AgentResponse = state.agentResponse ?? {
    reply: 'I could not complete that request. Please try again.',
    products: [],
    orders: [],
    userContext: null,
  };

  // Update checkpoint metadata
  response.checkpoint = {
    ...(state.checkpoint ?? { version: 1 }),
    activeAgent: state.parsedIntent?.intent ?? state.currentAgent ?? null,
    persona: state.persona ?? state.checkpoint?.persona ?? null,
    personalizationEnabled: state.checkpoint?.personalizationEnabled ?? false,
  };

  // Prepend self-correction acknowledgment if correction was detected
  if (state.correctionDetected && response.reply) {
    const prefix = formatSelfCorrectionPrefix({
      isCorrection: true,
      correctionType: (state.correctionType as any) ?? 'general',
    });
    if (!response.reply.startsWith('💡')) {
      response.reply = prefix + response.reply;
    }
  }

  // Secondary recovery: empty response guard
  if (
    response.products?.length === 0 &&
    (!response.reply || response.reply.length < 30) &&
    !response.requiresLogin
  ) {
    console.warn(
      '[LangGraph:GuardrailNode] Empty response detected — injecting recovery guidance',
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

  // Ensure explanation exists for product recommendations
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

  const finalized = guardrail.finalize(ctx, response);

  return {
    agentResponse: finalized,
    isComplete: true,
  };
}
