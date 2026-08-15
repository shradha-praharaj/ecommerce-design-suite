import {
  chatCheckpointsTable,
  chatConversationsTable,
  chatMessagesTable,
  db,
} from '@workspace/db';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { ConversationCheckpoint } from './types.js';
import { privacyGuard } from './privacy-guard.js';

const MAX_RESTORED_MESSAGES = 24;

export interface ConversationMemory {
  conversationId: number;
  history: Array<{ role: string; content: string }>;
  checkpoint?: ConversationCheckpoint;
  personalizationEnabled: boolean;
}

function normalizeCheckpoint(
  value: unknown,
): ConversationCheckpoint | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const state = value as Partial<ConversationCheckpoint>;
  return {
    version: typeof state.version === 'number' ? state.version : 1,
    activeAgent: state.activeAgent ?? null,
    category: state.category ?? null,
    goal: state.goal ?? null,
    recipient: state.recipient ?? null,
    persona: state.persona ?? null,
    usageIntensity: state.usageIntensity ?? null,
    budgetMin: state.budgetMin ?? null,
    budgetMax: state.budgetMax ?? null,
    answers: state.answers ?? {},
    nextQuestion: state.nextQuestion ?? null,
    personalizationEnabled: state.personalizationEnabled !== false,
    correctionRevision:
      typeof state.correctionRevision === 'number'
        ? state.correctionRevision
        : 0,
  };
}

export class ConversationMemoryAgent {
  async load(
    userId: number,
    conversationId?: number,
    personalizationEnabled?: boolean,
  ): Promise<ConversationMemory> {
    const conversation = conversationId
      ? await db.query.chatConversationsTable.findFirst({
          where: and(
            eq(chatConversationsTable.id, conversationId),
            eq(chatConversationsTable.userId, userId),
          ),
        })
      : await db
          .insert(chatConversationsTable)
          .values({
            userId,
            personalizationEnabled: personalizationEnabled ?? true,
          })
          .returning()
          .then(([created]) => created);

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    if (
      personalizationEnabled !== undefined &&
      conversation.personalizationEnabled !== personalizationEnabled
    ) {
      await db
        .update(chatConversationsTable)
        .set({ personalizationEnabled })
        .where(eq(chatConversationsTable.id, conversation.id));
      conversation.personalizationEnabled = personalizationEnabled;
    }

    const [messages, [checkpoint]] = await Promise.all([
      db
        .select({
          role: chatMessagesTable.role,
          content: chatMessagesTable.content,
        })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.conversationId, conversation.id))
        .orderBy(desc(chatMessagesTable.sequence))
        .limit(MAX_RESTORED_MESSAGES),
      db
        .select({ state: chatCheckpointsTable.state })
        .from(chatCheckpointsTable)
        .where(eq(chatCheckpointsTable.conversationId, conversation.id))
        .orderBy(desc(chatCheckpointsTable.sequence))
        .limit(1),
    ]);

    return {
      conversationId: conversation.id,
      history: messages.reverse(),
      checkpoint: normalizeCheckpoint(checkpoint?.state),
      personalizationEnabled:
        (personalizationEnabled ?? conversation.personalizationEnabled) &&
        conversation.personalizationEnabled,
    };
  }

  async appendTurn(input: {
    userId: number;
    conversationId: number;
    clientMessageId?: string;
    userMessage: string;
    assistantResponse: unknown;
    checkpoint?: ConversationCheckpoint;
  }): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(${input.conversationId})`,
      );
      const conversation = await tx.query.chatConversationsTable.findFirst({
        where: and(
          eq(chatConversationsTable.id, input.conversationId),
          eq(chatConversationsTable.userId, input.userId),
        ),
      });
      if (!conversation) throw new Error('Conversation not found');

      if (input.clientMessageId) {
        const existing = await tx.query.chatMessagesTable.findFirst({
          where: and(
            eq(chatMessagesTable.conversationId, input.conversationId),
            eq(chatMessagesTable.clientMessageId, input.clientMessageId),
          ),
        });
        if (existing) return;
      }

      const [lastMessage] = await tx
        .select({ sequence: chatMessagesTable.sequence })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.conversationId, input.conversationId))
        .orderBy(desc(chatMessagesTable.sequence))
        .limit(1);
      const sequence = (lastMessage?.sequence ?? 0) + 1;

      const redactedUserMessage = privacyGuard.redactPII(input.userMessage);
      const rawAssistantContent =
        typeof input.assistantResponse === 'object' && input.assistantResponse
          ? String((input.assistantResponse as { reply?: unknown }).reply ?? '')
          : String(input.assistantResponse);
      const redactedAssistantContent = privacyGuard.redactPII(rawAssistantContent);

      await tx.insert(chatMessagesTable).values([
        {
          conversationId: input.conversationId,
          role: 'user',
          content: redactedUserMessage,
          sequence,
          clientMessageId: input.clientMessageId,
        },
        {
          conversationId: input.conversationId,
          role: 'assistant',
          content: redactedAssistantContent,
          responseData: input.assistantResponse,
          sequence: sequence + 1,
        },
      ]);

      if (input.checkpoint) {
        await tx.insert(chatCheckpointsTable).values({
          conversationId: input.conversationId,
          version: input.checkpoint.version,
          agentName: input.checkpoint.activeAgent,
          state: input.checkpoint,
          sequence: sequence + 1,
        });
      }

      await tx
        .update(chatConversationsTable)
        .set({ updatedAt: new Date() })
        .where(eq(chatConversationsTable.id, input.conversationId));
    });
  }

  async findCompletedTurn(input: {
    userId: number;
    conversationId: number;
    clientMessageId: string;
  }): Promise<Record<string, unknown> | null> {
    const message = await db.query.chatMessagesTable.findFirst({
      where: and(
        eq(chatMessagesTable.conversationId, input.conversationId),
        eq(chatMessagesTable.clientMessageId, input.clientMessageId),
      ),
    });
    if (!message || message.role !== 'user') return null;

    const conversation = await db.query.chatConversationsTable.findFirst({
      where: and(
        eq(chatConversationsTable.id, input.conversationId),
        eq(chatConversationsTable.userId, input.userId),
      ),
    });
    if (!conversation) throw new Error('Conversation not found');

    const assistant = await db
      .select({ responseData: chatMessagesTable.responseData })
      .from(chatMessagesTable)
      .where(
        and(
          eq(chatMessagesTable.conversationId, input.conversationId),
          eq(chatMessagesTable.sequence, message.sequence + 1),
        ),
      )
      .limit(1);
    const responseData = assistant[0]?.responseData;
    return responseData && typeof responseData === 'object'
      ? (responseData as Record<string, unknown>)
      : null;
  }

  async findCompletedTurnForUser(
    userId: number,
    clientMessageId: string,
  ): Promise<{
    conversationId: number;
    response: Record<string, unknown>;
  } | null> {
    const matches = await db
      .select({
        conversationId: chatMessagesTable.conversationId,
        sequence: chatMessagesTable.sequence,
        role: chatMessagesTable.role,
      })
      .from(chatMessagesTable)
      .innerJoin(
        chatConversationsTable,
        eq(chatConversationsTable.id, chatMessagesTable.conversationId),
      )
      .where(
        and(
          eq(chatMessagesTable.clientMessageId, clientMessageId),
          eq(chatConversationsTable.userId, userId),
        ),
      )
      .limit(1);
    const match = matches[0];
    if (!match || match.role !== 'user') {
      return null;
    }

    const assistant = await db
      .select({ responseData: chatMessagesTable.responseData })
      .from(chatMessagesTable)
      .where(
        and(
          eq(chatMessagesTable.conversationId, match.conversationId),
          eq(chatMessagesTable.sequence, match.sequence + 1),
        ),
      )
      .limit(1);

    const responseData = assistant[0]?.responseData;
    if (!responseData || typeof responseData !== 'object') {
      return null;
    }

    return {
      conversationId: match.conversationId,
      response: responseData as Record<string, unknown>,
    };
  }

  async list(userId: number) {
    return db
      .select()
      .from(chatConversationsTable)
      .where(eq(chatConversationsTable.userId, userId))
      .orderBy(desc(chatConversationsTable.updatedAt));
  }

  async delete(userId: number, conversationId: number): Promise<boolean> {
    const deleted = await db
      .delete(chatConversationsTable)
      .where(
        and(
          eq(chatConversationsTable.id, conversationId),
          eq(chatConversationsTable.userId, userId),
        ),
      )
      .returning({ id: chatConversationsTable.id });
    return deleted.length > 0;
  }
}

export const conversationMemoryAgent = new ConversationMemoryAgent();
