import { detectCorrection } from '../../self-correction-engine.js';
import { detectPersona } from '../../supervisor-agent.js';
import type { ChatbotStateType, ChatbotStateUpdate } from '../state.js';

export async function selfCorrectionNode(
  state: ChatbotStateType,
): Promise<ChatbotStateUpdate> {
  const analysis = detectCorrection(state.message);
  const persona = detectPersona(state.message, state.checkpoint?.persona);

  return {
    correctionDetected: analysis.isCorrection,
    correctionType: analysis.correctionType ?? null,
    persona,
  };
}
