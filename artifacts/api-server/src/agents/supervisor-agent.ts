import {
  createCompiledGraph,
  type CompiledChatGraph,
} from './langgraph/index.js';
import { GuardrailAgent } from './guardrail-agent.js';
import { responsibleAIAgent } from './responsible-ai-agent.js';
import type { AgentContext, AgentResponse } from './types.js';

// Build context-aware fallback chips based on user message content
export function detectPersona(
  message: string,
  existingPersona?: string | null,
): string | null {
  if (existingPersona) return existingPersona;
  const lower = message.toLowerCase();
  if (
    /\b(my son|my daughter|my kid|for my child|for my boy|for my girl|for my children)\b/.test(
      lower,
    )
  ) {
    return 'parent';
  }
  if (
    /\b(i'?m a student|for school|for college|for university|for classes|for studies|for studying)\b/.test(
      lower,
    )
  ) {
    return 'student';
  }
  if (
    /\b(i'?m a gamer|for esports|hardcore gaming|competitive gaming|fps games)\b/.test(
      lower,
    )
  ) {
    return 'gamer';
  }
  if (
    /\b(for work|office use|workstation|for coding|for software development|for video editing|for architecture|for cad|professional)\b/.test(
      lower,
    )
  ) {
    return 'professional';
  }
  if (
    /\b(for my wife|for my husband|for my partner|anniversary|birthday gift|for my brother|for my sister|gift for)\b/.test(
      lower,
    )
  ) {
    return 'gift_buyer';
  }
  return null;
}

export class SupervisorAgent {
  name = 'SupervisorAgent';

  private compiledGraph: CompiledChatGraph | null = null;
  private readonly guardrail = new GuardrailAgent();

  async getGraph(): Promise<CompiledChatGraph> {
    if (!this.compiledGraph) {
      this.compiledGraph = await createCompiledGraph(process.env.DATABASE_URL);
    }
    return this.compiledGraph;
  }

  async execute(ctx: AgentContext): Promise<AgentResponse> {
    try {
      const responsibleResponse = await responsibleAIAgent.handle(ctx);
      if (responsibleResponse) return responsibleResponse;

      const graph = await this.getGraph();
      const threadId = ctx.userId ? `user-${ctx.userId}` : `anon-${Date.now()}`;

      const result = await graph.invoke(
        {
          message: ctx.message,
          userId: ctx.userId,
          userContext: ctx.userContext,
          history: ctx.history ?? [],
          checkpoint: ctx.checkpoint ?? null,
        },
        { configurable: { thread_id: threadId } },
      );

      if (result.agentResponse) {
        return result.agentResponse;
      }

      throw new Error('Graph execution did not produce an agent response');
    } catch (error) {
      console.error('[SupervisorAgent] Error in LangGraph execution:', error);

      // Fault-tolerant self-healing fallback response
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
        followUp: [
          'Help me pick a mobile',
          'Build a Gaming PC',
          'Show Trending Products',
          'My Orders',
        ],
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
