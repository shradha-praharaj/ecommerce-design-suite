import { StateGraph, START, END, MemorySaver } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { ChatbotState, type ChatbotStateType } from './state.js';
import { selfCorrectionNode } from './nodes/self-correction-node.js';
import { routerNode } from './nodes/router-node.js';
import { clarificationNode } from './nodes/clarification-node.js';
import { specialistNode } from './nodes/specialist-node.js';
import { guardrailNode } from './nodes/guardrail-node.js';

// ─── Conditional Edge: After Router ────────────────────────
function routeAfterRouter(
  state: ChatbotStateType,
): 'clarification' | 'specialist' {
  if (state.needsClarification) {
    return 'clarification';
  }
  return 'specialist';
}

// ─── Build the StateGraph ──────────────────────────────────
export function buildChatGraph() {
  const workflow = new StateGraph(ChatbotState)
    // Register all nodes
    .addNode('self_correction', selfCorrectionNode)
    .addNode('router', routerNode)
    .addNode('clarification', clarificationNode)
    .addNode('specialist', specialistNode)
    .addNode('guardrail', guardrailNode)

    // Flow edges
    .addEdge(START, 'self_correction')
    .addEdge('self_correction', 'router')
    .addConditionalEdges('router', routeAfterRouter, {
      clarification: 'clarification',
      specialist: 'specialist',
    })
    .addEdge('clarification', 'guardrail')
    .addEdge('specialist', 'guardrail')
    .addEdge('guardrail', END);

  return workflow;
}

let cachedPostgresSaver: PostgresSaver | null = null;

// ─── Compile with Checkpointer ─────────────────────────────
export async function createCompiledGraph(connectionString?: string) {
  const workflow = buildChatGraph();

  if (connectionString) {
    try {
      if (!cachedPostgresSaver) {
        cachedPostgresSaver = PostgresSaver.fromConnString(connectionString);
        await cachedPostgresSaver.setup();
      }
      return workflow.compile({ checkpointer: cachedPostgresSaver });
    } catch (err) {
      console.warn(
        '[LangGraph] PostgresSaver setup failed, falling back to MemorySaver:',
        err,
      );
    }
  }

  return workflow.compile({ checkpointer: new MemorySaver() });
}

export type CompiledChatGraph = Awaited<ReturnType<typeof createCompiledGraph>>;
