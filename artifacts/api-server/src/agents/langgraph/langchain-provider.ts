import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

/**
 * Factory for LangChain-wrapped Google Gemini chat model
 */
export function createChatModel(options?: {
  temperature?: number;
  model?: string;
  maxOutputTokens?: number;
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = options?.model ?? process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';

  return new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey: apiKey || 'dummy-key-for-offline-or-fallback',
    temperature: options?.temperature ?? 0.3,
    maxOutputTokens: options?.maxOutputTokens ?? 2048,
  });
}

/**
 * Low-temperature model for structured output / intent classification
 */
export function createStructuredModel() {
  return createChatModel({ temperature: 0.1 });
}
