/**
 * DB 스키마 정의 (PostgreSQL / Supabase)
 * 기존 SQLite 스키마를 PostgreSQL용으로 전환
 */
import { sql } from 'drizzle-orm';
import {
  pgTable,
  serial,
  text,
  integer,
  real,
  date,
  boolean,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ───────────────────────────────────────────────
// 1. 길드원 마스터 테이블
// ───────────────────────────────────────────────
export const guildMembers = pgTable('guild_members', {
  id: serial('id').primaryKey(),

  // 현재 닉네임
  currentNickname: text('current_nickname').notNull(),

  // 과거 닉네임 이력 — JSON 배열 문자열
  // 예: '["옛날닉네임", "그다음닉네임"]'
  nicknameHistory: text('nickname_history').notNull().default('[]'),

  server: text('server').notNull(),  // 예: "Scania 82"
  job: text('job').notNull(),        // 예: "아크메이지(불,독)"

  // 현재 상태
  status: text('status').notNull().default('active'),
  // 'active' | 'left' | 'suspected_rename'

  firstSeenAt: date('first_seen_at').notNull(),
  lastSeenAt: date('last_seen_at').notNull(),
  leftAt: date('left_at'),  // 탈퇴 감지 날짜

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ───────────────────────────────────────────────
// 2. 전투력 일별 스냅샷 테이블
// ───────────────────────────────────────────────
export const combatPowerSnapshots = pgTable('combat_power_snapshots', {
  id: serial('id').primaryKey(),

  memberId: integer('member_id').notNull().references(() => guildMembers.id),

  // 전투력을 text로 저장 (BigInt 범위 초과 방지)
  // 예: "201853000000000"
  combatPower: text('combat_power').notNull(),

  level: integer('level').notNull(),

  snapshotDate: date('snapshot_date').notNull(),

  // 직전 스냅샷 대비 증감 (음수 가능)
  powerDelta: text('power_delta'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  uniqueMemberDate: uniqueIndex('unique_member_date').on(
    table.memberId, table.snapshotDate
  ),
}));

// ───────────────────────────────────────────────
// 3. 길드 이벤트 로그 테이블
// ───────────────────────────────────────────────
export const guildEvents = pgTable('guild_events', {
  id: serial('id').primaryKey(),

  memberId: integer('member_id').references(() => guildMembers.id),

  // 'joined' | 'left' | 'nickname_changed' | 'rejoined'
  eventType: text('event_type').notNull(),

  oldValue: text('old_value'),
  newValue: text('new_value'),

  // 알고리즘 신뢰도 (0.0 ~ 1.0)
  confidence: real('confidence').notNull().default(1.0),

  // 관리자 수동 확인 여부
  isConfirmed: boolean('is_confirmed').notNull().default(false),

  note: text('note'),

  detectedAt: timestamp('detected_at').notNull().defaultNow(),
});

// 타입 추출
export type GuildMember = typeof guildMembers.$inferSelect;
export type NewGuildMember = typeof guildMembers.$inferInsert;
export type CombatPowerSnapshot = typeof combatPowerSnapshots.$inferSelect;
export type NewSnapshot = typeof combatPowerSnapshots.$inferInsert;
export type GuildEvent = typeof guildEvents.$inferSelect;
export type NewGuildEvent = typeof guildEvents.$inferInsert;
