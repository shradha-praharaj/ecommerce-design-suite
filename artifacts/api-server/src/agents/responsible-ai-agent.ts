import { db, userAiPreferencesTable } from '@workspace/db';
import { and, eq } from 'drizzle-orm';
import { privacyGuard } from './privacy-guard.js';
import type { AgentContext, AgentResponse } from './types.js';

const CONTROL_KEY = 'ai_suggestions_enabled';

function isAffirmative(message: string): boolean {
  return /^(?:yes|yep|yeah|sure|i consent|save it|go ahead)\b/i.test(
    message.trim(),
  );
}

function extractPreference(message: string): string | null {
  if (!/\b(?:preference|remember|store)\b/i.test(message)) return null;
  const match = message.match(
    /\b(?:save|remember|store)\s+(?:my\s+)?(?:preference\s*)?(?:for\s+)?(.+?)[.!?]?$/i,
  );
  const preference = match?.[1]?.trim();
  return preference && preference.length <= 120 ? preference : null;
}

function preferenceKey(value: string): string {
  return `preference:${value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')}`;
}

function response(
  reply: string,
  options: Partial<AgentResponse> = {},
): AgentResponse {
  return {
    reply,
    products: [],
    orders: [],
    userContext: null,
    ...options,
  };
}

export class ResponsibleAIAgent {
  async handle(ctx: AgentContext): Promise<AgentResponse | null> {
    const message = ctx.message.trim();
    const lower = message.toLowerCase();

    if (/\b(?:turn on|enable) ai suggestions\b/.test(lower)) {
      return this.setSuggestions(ctx.userId, true);
    }

    if (
      /\b(?:turn off|disable|stop) ai suggestions\b|\bsearch manually\b/.test(
        lower,
      )
    ) {
      return this.setSuggestions(ctx.userId, false);
    }

    if (
      /\b(?:delete|remove|forget|clear)\b.*\b(?:all )?(?:saved )?(?:preferences|memory)\b/i.test(
        message,
      )
    ) {
      return this.deletePreferences(ctx.userId);
    }

    if (
      /\b(?:what|which) personal data\b.*\b(?:store|saved|keep|have)\b|\b(?:show|list) (?:my )?(?:saved )?(?:preferences|data)\b/i.test(
        message,
      )
    ) {
      return this.listPreferences(ctx.userId);
    }

    const requestedPreference = extractPreference(message);
    if (requestedPreference) {
      return response(
        `I can save **${requestedPreference}** for future recommendations. Do you consent to storing this preference?`,
        {
          followUp: ['Yes, save it', "No, don't save it"],
          explanation: {
            why: ['Preferences are stored only after your explicit consent.'],
            source: 'user_preferences',
          },
        },
      );
    }

    if (isAffirmative(message) && this.hasPendingConsent(ctx.history)) {
      const pendingPreference = this.getPendingPreference(ctx.history);
      if (pendingPreference) {
        return this.savePreference(ctx.userId, pendingPreference);
      }
    }

    if (
      /\b(?:screen reader|accessible description|describe this product)\b/i.test(
        message,
      )
    ) {
      return response(
        'Screen-reader description: I will describe products in a consistent text order: product name, brand, price, rating, stock status, then the key specifications. No image-only information is needed to compare the result. Reply with the product name for a product-specific description.',
        {
          accessibleDescription:
            'Product details are available as text: name, brand, price, rating, stock status, and key specifications.',
          followUp: ['Describe a product by name'],
        },
      );
    }

    if (
      /\b(?:human review|speak to a human|human agent|checkout looks wrong)\b/i.test(
        message,
      )
    ) {
      return response(
        'I have escalated this checkout concern for human review. Please do not place the order until the review is complete.',
        {
          requiresHumanReview: true,
          followUp: ['Show my cart', 'Contact support'],
        },
      );
    }

    if (ctx.userId && !(await this.suggestionsEnabled(ctx.userId))) {
      return response(
        'AI suggestions are off. You are in manual search mode, so I will not personalize or recommend products until you turn suggestions back on.',
        {
          manualSearchMode: true,
          followUp: ['Turn on AI suggestions'],
        },
      );
    }

    return null;
  }

  private hasPendingConsent(history: AgentContext['history']): boolean {
    return Boolean(
      [...(history ?? [])]
        .reverse()
        .find(
          (entry) =>
            entry.role === 'assistant' &&
            entry.content.includes(
              'Do you consent to storing this preference?',
            ),
        ),
    );
  }

  private getPendingPreference(
    history: AgentContext['history'],
  ): string | null {
    for (const entry of [...(history ?? [])].reverse()) {
      if (entry.role !== 'user') continue;
      const preference = extractPreference(entry.content);
      if (preference) return preference;
    }
    return null;
  }

  private async savePreference(
    userId: number | null,
    value: string,
  ): Promise<AgentResponse> {
    if (!userId) {
      return response(
        'Please log in before saving preferences to your account.',
        {
          requiresLogin: true,
        },
      );
    }
    if (privacyGuard.containsPII(value)) {
      return response(
        'I cannot store personal or sensitive information as a recommendation preference. Please provide a product preference instead.',
      );
    }

    const now = new Date();
    await db
      .insert(userAiPreferencesTable)
      .values({
        userId,
        preferenceKey: preferenceKey(value),
        preferenceValue: value,
        kind: 'preference',
        consentedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          userAiPreferencesTable.userId,
          userAiPreferencesTable.preferenceKey,
        ],
        set: { preferenceValue: value, consentedAt: now, updatedAt: now },
      });

    return response(`Saved your preference: **${value}**.`, {
      explanation: {
        why: ['Saved after your explicit consent.'],
        source: 'user_preferences',
      },
    });
  }

  private async deletePreferences(
    userId: number | null,
  ): Promise<AgentResponse> {
    if (!userId) {
      return response('Please log in to manage saved preferences.', {
        requiresLogin: true,
      });
    }
    await db
      .delete(userAiPreferencesTable)
      .where(
        and(
          eq(userAiPreferencesTable.userId, userId),
          eq(userAiPreferencesTable.kind, 'preference'),
        ),
      );
    return response('Deleted all saved recommendation preferences.');
  }

  private async listPreferences(userId: number | null): Promise<AgentResponse> {
    if (!userId) {
      return response(
        'Please log in to view account-level saved preferences.',
        {
          requiresLogin: true,
        },
      );
    }
    const preferences = await db
      .select({ value: userAiPreferencesTable.preferenceValue })
      .from(userAiPreferencesTable)
      .where(
        and(
          eq(userAiPreferencesTable.userId, userId),
          eq(userAiPreferencesTable.kind, 'preference'),
        ),
      );
    if (preferences.length === 0) {
      return response(
        'I do not have any consented chatbot preferences stored for you.',
      );
    }
    return response(
      `I store these consented chatbot preferences:\n${preferences.map((item) => `- ${item.value}`).join('\n')}`,
      {
        explanation: {
          why: ['Only preferences you explicitly consented to are listed.'],
          source: 'user_preferences',
        },
      },
    );
  }

  private async setSuggestions(
    userId: number | null,
    enabled: boolean,
  ): Promise<AgentResponse> {
    if (!userId) {
      return response(
        enabled
          ? 'AI suggestions are back on for this chat session.'
          : 'AI suggestions are off for this chat session. You are now in manual search mode.',
        { manualSearchMode: !enabled },
      );
    }
    const now = new Date();
    await db
      .insert(userAiPreferencesTable)
      .values({
        userId,
        preferenceKey: CONTROL_KEY,
        preferenceValue: enabled ? 'on' : 'off',
        kind: 'control',
        consentedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          userAiPreferencesTable.userId,
          userAiPreferencesTable.preferenceKey,
        ],
        set: {
          preferenceValue: enabled ? 'on' : 'off',
          consentedAt: now,
          updatedAt: now,
        },
      });
    return response(
      enabled
        ? 'AI suggestions are back on. I will use your requests to help narrow options.'
        : 'AI suggestions are off. You are now in manual search mode.',
      { manualSearchMode: !enabled },
    );
  }

  private async suggestionsEnabled(userId: number): Promise<boolean> {
    const control = await db.query.userAiPreferencesTable.findFirst({
      where: and(
        eq(userAiPreferencesTable.userId, userId),
        eq(userAiPreferencesTable.preferenceKey, CONTROL_KEY),
      ),
    });
    return control?.preferenceValue !== 'off';
  }
}

export const responsibleAIAgent = new ResponsibleAIAgent();
