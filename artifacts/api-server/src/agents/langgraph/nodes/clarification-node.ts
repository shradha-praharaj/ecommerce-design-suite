import { createProductSearchClarification } from '../../clarification-policy.js';
import { GuardrailAgent } from '../../guardrail-agent.js';
import type { ChatbotStateType, ChatbotStateUpdate } from '../state.js';

const guardrail = new GuardrailAgent();

export async function clarificationNode(
  state: ChatbotStateType,
): Promise<ChatbotStateUpdate> {
  const ctx = {
    message: state.message,
    userId: state.userId,
    userContext: state.userContext,
    history: state.history,
    checkpoint: state.checkpoint ?? undefined,
  };
  const parsed = state.parsedIntent ?? { intent: 'unknown' };

  console.log('[LangGraph:ClarificationNode] Requesting category clarification');
  const clarification = createProductSearchClarification(ctx, parsed);
  const response = guardrail.finalize(ctx, clarification);

  return {
    agentResponse: response,
    isComplete: true,
  };
}
