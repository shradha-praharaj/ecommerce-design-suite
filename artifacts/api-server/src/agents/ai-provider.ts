import { GoogleGenAI, Type } from '@google/genai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AIAvailability {
  available: boolean;
  provider: string;
  model?: string;
  error?: string;
}

export interface StructuredSchema {
  type: string;
  properties: Record<string, any>;
}

interface GenerationOptions {
  maxOutputTokens?: number;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

interface AIProvider {
  generateStructuredJSON(
    prompt: string,
    schema: StructuredSchema,
    options?: GenerationOptions,
  ): Promise<Record<string, any>>;
  checkAvailability(): Promise<AIAvailability>;
}

// ---------------------------------------------------------------------------
// Gemini Provider
// ---------------------------------------------------------------------------

const GEMINI_DEFAULT_MODELS = [
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
  'gemini-2.0-flash',
];

const GEMINI_MODELS_CACHE_TTL_MS = 5 * 60 * 1000;
let cachedGeminiModels: { models: string[]; expiresAt: number } | null = null;

const NON_TEXT_MODEL_PATTERN =
  /(?:tts|image|lyria|robotics|deep-research|nano-banana|computer-use|antigravity)/i;
const ROUTER_MODEL_PATTERN = /^gemini-(?:\d+(?:\.\d+)?-)?flash(?:-|$)/i;

function getConfiguredGeminiModels(): string[] {
  return [process.env.GEMINI_MODEL, ...GEMINI_DEFAULT_MODELS]
    .filter((model): model is string => Boolean(model))
    .filter((model, index, models) => models.indexOf(model) === index);
}

async function discoverGeminiModels(apiKey: string): Promise<string[]> {
  if (cachedGeminiModels && cachedGeminiModels.expiresAt > Date.now()) {
    return cachedGeminiModels.models;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
  );
  if (!response.ok) {
    throw new Error(
      `Gemini model discovery failed with HTTP ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
  };
  const models = (data.models ?? [])
    .filter((model) =>
      model.supportedGenerationMethods?.includes('generateContent'),
    )
    .map((model) => model.name?.replace(/^models\//, ''))
    .filter((model): model is string => Boolean(model))
    .filter(
      (model) =>
        !NON_TEXT_MODEL_PATTERN.test(model) && ROUTER_MODEL_PATTERN.test(model),
    );

  cachedGeminiModels = {
    models,
    expiresAt: Date.now() + GEMINI_MODELS_CACHE_TTL_MS,
  };
  return models;
}

async function getGeminiModels(apiKey: string): Promise<string[]> {
  const configuredModels = getConfiguredGeminiModels();
  try {
    const availableModels = await discoverGeminiModels(apiKey);
    const preferredAvailableModels = configuredModels.filter((model) =>
      availableModels.includes(model),
    );
    return [...preferredAvailableModels, ...availableModels].filter(
      (model, index, models) => models.indexOf(model) === index,
    );
  } catch (error) {
    console.warn('[AIService] Gemini model discovery failed:', error);
    return configuredModels;
  }
}

class GeminiProvider implements AIProvider {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
  }

  async generateStructuredJSON(
    prompt: string,
    schema: StructuredSchema,
    options: GenerationOptions = {},
  ): Promise<Record<string, any>> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const models = await getGeminiModels(this.apiKey);

    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            maxOutputTokens: options.maxOutputTokens ?? 2048,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: schema.properties,
            },
          },
        });
        return JSON.parse(response.text || '{}');
      } catch (error) {
        console.warn(`[AIService] Gemini model ${model} failed:`, error);
      }
    }

    throw new Error('All Gemini models failed');
  }

  async checkAvailability(): Promise<AIAvailability> {
    if (!this.apiKey) {
      return {
        available: false,
        provider: 'google',
        error: 'GEMINI_API_KEY is not configured',
      };
    }

    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    let checkedModels: string[];
    try {
      checkedModels = await getGeminiModels(this.apiKey);
    } catch (error) {
      return {
        available: false,
        provider: 'google',
        error:
          error instanceof Error ? error.message : 'Model discovery failed',
      };
    }

    for (const model of checkedModels) {
      try {
        await ai.models.generateContent({
          model,
          contents: 'Return a JSON object confirming availability.',
          config: {
            maxOutputTokens: 16,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                available: { type: Type.BOOLEAN },
              },
            },
          },
        });
        return { available: true, provider: 'google', model };
      } catch {
        // try next model
      }
    }

    return {
      available: false,
      provider: 'google',
      error: 'No configured Gemini model responded',
    };
  }
}

// ---------------------------------------------------------------------------
// OpenCode Multi-Model Provider
// ---------------------------------------------------------------------------
// Each model has its own free-tier quota on OpenCode. When one model's quota
// is exhausted (HTTP 429 / FreeUsageLimitError), we automatically rotate to
// the next model in the chain before falling back to Google Gemini.
// ---------------------------------------------------------------------------

const OPENCODE_BASE_URL = 'https://opencode.ai/zen/v1';

/** Ordered list of OpenCode free-tier models to try */
const OPENCODE_MODEL_CHAIN = [
  'mimo-v2.5-free',
  'mimo-v2-pro-free',
  'nemotron-3-super-free',
  'minimax-m2.5-free',
  'deepseek-v4-flash-free',
  'big-pickle',
  'gpt-5-nano',
];

const OPENCODE_RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000;
const OPENCODE_AUTH_COOLDOWN_MS = 15 * 60 * 1000;
const OPENCODE_MODEL_ERROR_COOLDOWN_MS = 60 * 60 * 1000;
const opencodeModelCooldowns = new Map<string, number>();

function isOpenCodeModelCoolingDown(model: string): boolean {
  const retryAt = opencodeModelCooldowns.get(model);
  if (!retryAt) return false;
  if (retryAt > Date.now()) return true;
  opencodeModelCooldowns.delete(model);
  return false;
}

function markOpenCodeModelUnavailable(model: string, status: number): void {
  const cooldownMs =
    status === 401 || status === 403
      ? OPENCODE_AUTH_COOLDOWN_MS
      : status === 429
        ? OPENCODE_RATE_LIMIT_COOLDOWN_MS
        : OPENCODE_MODEL_ERROR_COOLDOWN_MS;
  const models = status === 401 || status === 403 ? OPENCODE_MODEL_CHAIN : [model];
  const retryAt = Date.now() + cooldownMs;

  for (const modelName of models) {
    opencodeModelCooldowns.set(modelName, retryAt);
  }
}

function isRateLimitOrModelError(status: number, body: string): boolean {
  return (
    status === 429 ||
    status === 400 ||
    status === 401 ||
    status === 404 ||
    body.toLowerCase().includes('rate limit') ||
    body.toLowerCase().includes('freeusagelimit') ||
    body.toLowerCase().includes('quota') ||
    body.toLowerCase().includes('resource_exhausted') ||
    body.toLowerCase().includes('not supported') ||
    body.toLowerCase().includes('modelerror')
  );
}

class OpenCodeProvider implements AIProvider {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.OPENCODE_API_KEY || '';
  }

  private async callModel(
    model: string,
    messages: Array<{ role: string; content: string }>,
    maxTokens: number,
    useJsonFormat: boolean,
  ): Promise<
    { ok: true; content: string } | { ok: false; status: number; body: string }
  > {
    const response = await fetch(`${OPENCODE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        ...(useJsonFormat ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, status: response.status, body: text };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return { ok: true, content: data.choices?.[0]?.message?.content || '{}' };
  }

  async generateStructuredJSON(
    prompt: string,
    _schema: StructuredSchema,
    options: GenerationOptions = {},
  ): Promise<Record<string, any>> {
    if (!this.apiKey) {
      throw new Error('OPENCODE_API_KEY is not configured');
    }

    const messages = [
      {
        role: 'system',
        content:
          'You must respond ONLY with valid JSON. No markdown, no explanation, just the raw JSON object.',
      },
      { role: 'user', content: prompt },
    ];

    let lastError: Error | null = null;

    for (const model of OPENCODE_MODEL_CHAIN) {
      if (isOpenCodeModelCoolingDown(model)) continue;

      try {
        const result = await this.callModel(
          model,
          messages,
          options.maxOutputTokens ?? 2048,
          true,
        );

        if (!result.ok) {
          if (isRateLimitOrModelError(result.status, result.body)) {
            markOpenCodeModelUnavailable(model, result.status);
            console.warn(
              `[AIService] OpenCode model "${model}" unavailable (${result.status}), rotating to next model in chain...`,
            );
            continue; // Try next model in chain
          }
          throw new Error(
            `OpenCode API error ${result.status}: ${result.body.slice(0, 200)}`,
          );
        }

        console.log(
          `[AIService] OpenCode model "${model}" responded successfully`,
        );
        return JSON.parse(result.content);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(
          `[AIService] OpenCode model "${model}" failed:`,
          lastError.message,
        );
      }
    }

    throw lastError ?? new Error('All OpenCode models exhausted');
  }

  async checkAvailability(): Promise<AIAvailability> {
    if (!this.apiKey) {
      return {
        available: false,
        provider: 'opencode',
        error: 'OPENCODE_API_KEY is not configured',
      };
    }

    for (const model of OPENCODE_MODEL_CHAIN) {
      if (isOpenCodeModelCoolingDown(model)) continue;

      try {
        const result = await this.callModel(
          model,
          [{ role: 'user', content: 'Say "ok"' }],
          8,
          false,
        );

        if (!result.ok) {
          if (isRateLimitOrModelError(result.status, result.body)) {
            markOpenCodeModelUnavailable(model, result.status);
            console.warn(
              `[AIService] OpenCode model "${model}" unavailable (${result.status}) during availability check, rotating...`,
            );
            continue;
          }
          continue;
        }

        return { available: true, provider: 'opencode', model };
      } catch {
        continue;
      }
    }

    return {
      available: false,
      provider: 'opencode',
      error: `All OpenCode free-tier models exhausted: ${OPENCODE_MODEL_CHAIN.join(', ')}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Quota Status Types & Diagnostic Endpoint Logic
// ---------------------------------------------------------------------------

export interface LLMProviderDetail {
  configured: boolean;
  status:
    'available' | 'rate_limited' | 'quota_exhausted' | 'unconfigured' | 'error';
  model?: string;
  modelChain?: string[];
  error?: string | null;
}

export interface LLMQuotaStatus {
  status:
    | 'available'
    | 'rate_limited'
    | 'quota_exhausted'
    | 'unconfigured'
    | 'offline';
  canUseModel: boolean;
  isLimitExhausted: boolean;
  activeProvider: string;
  activeModel: string;
  checkedAt: string;
  details: string;
  orchestrator: string;
  providers: {
    google: LLMProviderDetail;
    opencode: LLMProviderDetail;
  };
}

export async function checkLLMQuotaStatus(): Promise<LLMQuotaStatus> {
  const gemini = new GeminiProvider();
  const opencode = new OpenCodeProvider();

  const [geminiResult, opencodeResult] = await Promise.all([
    gemini.checkAvailability(),
    opencode.checkAvailability(),
  ]);

  const parseProviderDetail = (
    res: AIAvailability,
    isConfigured: boolean,
    modelChain?: string[],
  ): LLMProviderDetail => {
    if (!isConfigured) {
      return {
        configured: false,
        status: 'unconfigured',
        error: 'API key not configured',
      };
    }
    if (res.available) {
      return {
        configured: true,
        status: 'available',
        model: res.model,
        modelChain,
        error: null,
      };
    }
    const err = res.error || 'Unknown error';
    const isExhausted =
      err.includes('429') ||
      err.toLowerCase().includes('rate limit') ||
      err.toLowerCase().includes('quota') ||
      err.toLowerCase().includes('freeusagelimit') ||
      err.toLowerCase().includes('resource_exhausted') ||
      err.toLowerCase().includes('exhausted');

    return {
      configured: true,
      status: isExhausted ? 'quota_exhausted' : 'error',
      model: res.model,
      modelChain,
      error: res.error,
    };
  };

  const googleDetail = parseProviderDetail(
    geminiResult,
    Boolean(process.env.GEMINI_API_KEY),
  );
  const opencodeDetail = parseProviderDetail(
    opencodeResult,
    Boolean(process.env.OPENCODE_API_KEY),
    OPENCODE_MODEL_CHAIN,
  );

  const activeProvider = (process.env.AI_PROVIDER || 'google').toLowerCase();
  const activeDetail =
    activeProvider === 'opencode' ? opencodeDetail : googleDetail;

  const anyAvailable =
    googleDetail.status === 'available' ||
    opencodeDetail.status === 'available';
  const isActiveExhausted = activeDetail.status === 'quota_exhausted';

  let status: LLMQuotaStatus['status'] = 'available';
  let details = 'LLM service is online and quota is available.';

  if (!anyAvailable) {
    if (
      googleDetail.status === 'quota_exhausted' ||
      opencodeDetail.status === 'quota_exhausted'
    ) {
      status = 'quota_exhausted';
      details =
        'All configured LLM providers have exhausted their free rate limit or quota. The chatbot will use local deterministic fallback.';
    } else if (!googleDetail.configured && !opencodeDetail.configured) {
      status = 'unconfigured';
      details = 'No AI provider API keys are configured.';
    } else {
      status = 'offline';
      details = 'LLM providers are currently unreachable.';
    }
  } else if (isActiveExhausted) {
    status = 'rate_limited';
    details = `Active provider (${activeProvider}) is rate-limited, but secondary provider is available.`;
  }

  return {
    status,
    canUseModel: anyAvailable,
    isLimitExhausted:
      !anyAvailable &&
      (googleDetail.status === 'quota_exhausted' ||
        opencodeDetail.status === 'quota_exhausted'),
    activeProvider,
    activeModel:
      activeDetail.model || process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    checkedAt: new Date().toISOString(),
    details,
    orchestrator: 'LangGraph (StateGraph) + @langchain/google-genai',
    providers: {
      google: googleDetail,
      opencode: opencodeDetail,
    },
  };
}

// ---------------------------------------------------------------------------
// Failover Provider Wrapper (chains OpenCode model rotation → Google Gemini)
// ---------------------------------------------------------------------------

class FailoverAIProvider implements AIProvider {
  constructor(
    private readonly primary: AIProvider,
    private readonly secondary: AIProvider,
    private readonly primaryName: string,
    private readonly secondaryName: string,
  ) {}

  async generateStructuredJSON(
    prompt: string,
    schema: StructuredSchema,
    options?: GenerationOptions,
  ): Promise<Record<string, any>> {
    try {
      return await this.primary.generateStructuredJSON(prompt, schema, options);
    } catch (primaryError) {
      console.warn(
        `[AIService] ${this.primaryName} failed (${primaryError instanceof Error ? primaryError.message : primaryError}), falling over to ${this.secondaryName}...`,
      );
      return await this.secondary.generateStructuredJSON(prompt, schema, options);
    }
  }

  async checkAvailability(): Promise<AIAvailability> {
    const primaryStatus = await this.primary.checkAvailability();
    if (primaryStatus.available) return primaryStatus;
    const secondaryStatus = await this.secondary.checkAvailability();
    if (secondaryStatus.available) {
      return {
        available: true,
        provider: secondaryStatus.provider,
        model: secondaryStatus.model,
      };
    }
    return primaryStatus;
  }
}

// ---------------------------------------------------------------------------
// Singleton provider access
// ---------------------------------------------------------------------------

let cachedProvider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;

  const preferred = (process.env.AI_PROVIDER || 'google').toLowerCase();
  const gemini = new GeminiProvider();
  const opencode = new OpenCodeProvider();

  if (preferred === 'opencode' && process.env.OPENCODE_API_KEY) {
    console.log(
      `[AIService] Active provider: opencode [${OPENCODE_MODEL_CHAIN.join(' → ')}] (failover: google gemini)`,
    );
    cachedProvider = new FailoverAIProvider(
      opencode,
      gemini,
      'OpenCode',
      'Google Gemini',
    );
  } else {
    console.log(
      `[AIService] Active provider: google gemini (failover: opencode [${OPENCODE_MODEL_CHAIN.join(' → ')}])`,
    );
    cachedProvider = new FailoverAIProvider(
      gemini,
      opencode,
      'Google Gemini',
      'OpenCode',
    );
  }

  return cachedProvider;
}

export async function checkAIAvailability(): Promise<AIAvailability> {
  return getAIProvider().checkAvailability();
}
