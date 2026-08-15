import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { usersTable } from './users';

export const userAiPreferencesTable = pgTable(
  'user_ai_preferences',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    preferenceKey: text('preference_key').notNull(),
    preferenceValue: text('preference_value').notNull(),
    kind: text('kind').notNull().default('preference'),
    consentedAt: timestamp('consented_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('user_ai_preferences_user_key_idx').on(
      table.userId,
      table.preferenceKey,
    ),
    index('user_ai_preferences_user_kind_idx').on(table.userId, table.kind),
  ],
);