import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { usersTable } from './users';
import { productsTable } from './products';

export const userBehaviorEventsTable = pgTable(
  'user_behavior_events',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => usersTable.id, {
      onDelete: 'cascade',
    }),
    sessionId: text('session_id').notNull(),
    eventType: text('event_type').notNull(), // 'view' | 'search' | 'add_to_cart' | 'purchase' | 'chatbot_query' | 'preference_stated'
    productId: integer('product_id').references(() => productsTable.id, {
      onDelete: 'set null',
    }),
    category: text('category'),
    brand: text('brand'),
    keyword: text('keyword'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('user_behavior_events_user_type_idx').on(
      table.userId,
      table.eventType,
    ),
    index('user_behavior_events_user_created_idx').on(
      table.userId,
      table.createdAt,
    ),
    index('user_behavior_events_session_idx').on(
      table.sessionId,
      table.createdAt,
    ),
    index('user_behavior_events_category_idx').on(
      table.userId,
      table.category,
    ),
  ],
);

export type UserBehaviorEvent = typeof userBehaviorEventsTable.$inferSelect;
export type InsertUserBehaviorEvent = typeof userBehaviorEventsTable.$inferInsert;
