import {
  index,
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod/v4';
import { usersTable } from './users';

export const chatConversationsTable = pgTable(
  'chat_conversations',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    title: text('title'),
    personalizationEnabled: boolean('personalization_enabled')
      .notNull()
      .default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('chat_conversations_user_updated_idx').on(
      table.userId,
      table.updatedAt,
    ),
  ],
);

export const chatMessagesTable = pgTable(
  'chat_messages',
  {
    id: serial('id').primaryKey(),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => chatConversationsTable.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    responseData: jsonb('response_data'),
    sequence: integer('sequence').notNull(),
    clientMessageId: text('client_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('chat_messages_conversation_sequence_idx').on(
      table.conversationId,
      table.sequence,
    ),
    uniqueIndex('chat_messages_conversation_client_message_idx').on(
      table.conversationId,
      table.clientMessageId,
    ),
  ],
);

export const chatCheckpointsTable = pgTable(
  'chat_checkpoints',
  {
    id: serial('id').primaryKey(),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => chatConversationsTable.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    agentName: text('agent_name'),
    state: jsonb('state').notNull(),
    sequence: integer('sequence').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('chat_checkpoints_conversation_sequence_idx').on(
      table.conversationId,
      table.sequence,
    ),
  ],
);

export const insertChatConversationSchema = createInsertSchema(
  chatConversationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertChatMessageSchema = createInsertSchema(
  chatMessagesTable,
).omit({
  id: true,
  createdAt: true,
});
export const insertChatCheckpointSchema = createInsertSchema(
  chatCheckpointsTable,
).omit({ id: true, createdAt: true });

export type ChatConversation = typeof chatConversationsTable.$inferSelect;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;
export type ChatCheckpoint = typeof chatCheckpointsTable.$inferSelect;
export type InsertChatConversation = z.infer<
  typeof insertChatConversationSchema
>;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type InsertChatCheckpoint = z.infer<typeof insertChatCheckpointSchema>;
