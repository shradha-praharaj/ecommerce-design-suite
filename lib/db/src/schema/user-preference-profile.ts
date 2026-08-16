import {
  pgTable,
  integer,
  text,
  timestamp,
  jsonb,
  numeric,
} from 'drizzle-orm/pg-core';
import { usersTable } from './users';

export const userPreferenceProfilesTable = pgTable(
  'user_preference_profiles',
  {
    userId: integer('user_id')
      .primaryKey()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    topCategories: jsonb('top_categories').notNull().default([]), // string[]
    topBrands: jsonb('top_brands').notNull().default([]), // string[]
    useCases: jsonb('use_cases').notNull().default([]), // string[] e.g. ["gaming", "music"]
    priceRange: jsonb('price_range'), // { min: number, max: number } | null
    personaHint: text('persona_hint'), // "gamer" | "audiophile" | "student" | "professional" | null
    giftBuyerScore: numeric('gift_buyer_score', { precision: 4, scale: 3 })
      .notNull()
      .default('0.000'),
    conversationSignals: jsonb('conversation_signals').notNull().default([]), // string[] e.g. ["loves Samsung", "prefers AMD"]
    lastComputedAt: timestamp('last_computed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type UserPreferenceProfile = typeof userPreferenceProfilesTable.$inferSelect;
export type InsertUserPreferenceProfile = typeof userPreferenceProfilesTable.$inferInsert;
