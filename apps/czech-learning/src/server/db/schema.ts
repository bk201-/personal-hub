import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';


export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  totpSecret: text('totp_secret'), // null = 2FA disabled
  role: text('role').notNull().default('admin'),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // UUID v4
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenHash: text('refresh_token_hash').notNull(),
  expiresAt: integer('expires_at').notNull(), // unixepoch
  unlockedGroupIds: text('unlocked_group_ids').notNull().default('[]'), // kept for compat, unused
  userAgent: text('user_agent'),
  ip: text('ip'),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

// ─── Phase 2 ──────────────────────────────────────────────────────────────────

export const words = sqliteTable('words', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  czech: text('czech').notNull(),
  russian: text('russian').notNull(),
  english: text('english'), // reserved for Czech ↔ English future mode
  pos: text('pos').$type<
    'noun' | 'verb' | 'adjective' | 'adverb' | 'pronoun' |
    'numeral' | 'preposition' | 'conjunction' | 'interjection' | 'phrase'
  >(),
  gender: text('gender').$type<'ma' | 'mi' | 'f' | 'n'>(),     // noun: animate/inanimate/fem/neuter
  numberType: text('number_type').$type<'singular' | 'plural'>(), // singularia/pluralia tantum
  aspect: text('aspect').$type<'perfective' | 'imperfective'>(), // verb aspect
  verbPair: text('verb_pair'),                                    // paired perf↔imperf verb
  conjugationClass: text('conjugation_class'),                   // verb: I-nese/II-tiskne/III-kryje/IV-prosi/V-dela
  declensionClass: text('declension_class'),                     // noun: pan/muz/hrad/stroj/zena/ruze/pisen/kost/mesto/more/kure/staveni
  notes: text('notes'),
  lesson: integer('lesson'),
  source: text('source').$type<'textbook' | 'manual'>(),
  seznamUrl: text('seznam_url'),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});
