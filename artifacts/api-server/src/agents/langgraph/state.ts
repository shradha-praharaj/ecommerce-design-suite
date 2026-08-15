import { Annotation } from '@langchain/langgraph';
import type {
  ConversationCheckpoint,
  AgentResponse,
  ParsedIntent,
  UserContext,
} from '../types.js';

// ─── LangGraph State Annotation ────────────────────────────
export const ChatbotState = Annotation.Root({
  // Current user message
  message: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),

  // User identity
  userId: Annotation<number | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Enriched user context (orders, interests, brands)
  userContext: Annotation<UserContext>({
    reducer: (_, update) => update,
    default: () => ({}),
  }),

  // Conversation history (message reducer appends)
  history: Annotation<Array<{ role: string; content: string }>>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),

  // Parsed intent from router
  parsedIntent: Annotation<ParsedIntent | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Business checkpoint (persona, active advisor, budget, etc.)
  checkpoint: Annotation<ConversationCheckpoint | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Which specialist agent to invoke
  currentAgent: Annotation<string>({
    reducer: (_, update) => update,
    default: () => 'unknown',
  }),

  // Specialist agent response (built incrementally)
  agentResponse: Annotation<AgentResponse | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Self-correction analysis
  correctionDetected: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),
  correctionType: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Persona detection
  persona: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Control flags
  needsClarification: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),
  isComplete: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),
});

export type ChatbotStateType = typeof ChatbotState.State;
export type ChatbotStateUpdate = typeof ChatbotState.Update;
