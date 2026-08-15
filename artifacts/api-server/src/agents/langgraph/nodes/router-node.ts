import { RouterAgent } from '../../router-agent.js';
import {
  mergePendingProductSearch,
  needsProductSearchClarification,
} from '../../clarification-policy.js';
import type { ChatbotStateType, ChatbotStateUpdate } from '../state.js';

const router = new RouterAgent();

export async function routerNode(
  state: ChatbotStateType,
): Promise<ChatbotStateUpdate> {
  const ctx = {
    message: state.message,
    userId: state.userId,
    userContext: state.userContext,
    history: state.history,
    checkpoint: state.checkpoint ?? undefined,
  };

  const parsed = mergePendingProductSearch(
    ctx,
    await router.classifyIntent(ctx),
  );

  // Checkpoint-aware: if router returns unknown or empty intent, but checkpoint has an active advisor agent, preserve it
  if (
    (!parsed.intent || parsed.intent === 'unknown') &&
    (state.checkpoint?.activeAgent === 'gaming_build' ||
      state.checkpoint?.activeAgent === 'guided_advisor')
  ) {
    parsed.intent = state.checkpoint.activeAgent;
  }

  const needsClarification = needsProductSearchClarification(ctx, parsed);
  const currentAgent = parsed.isGreeting
    ? 'greeting'
    : parsed.intent || 'unknown';

  return {
    parsedIntent: parsed,
    currentAgent,
    needsClarification,
  };
}
