/**
 * Drizzle ORM + postgres (Supabase 연결)
 * Lazy initialization: 빌드 시 DB 연결 시도를 막고, 실제 요청 시에만 연결한다.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// 빌드 시점에는 DB 연결 안 함 — DATABASE_URL이 없으면 실제 요청 시 오류 발생
let _db: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (_db) return _db;
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.');
  }
  // max: 1 → Vercel Serverless에서 연결 풀 낭비 방지
  const client = postgres(process.env.DATABASE_URL, {
    max: 1,
    ssl: 'require',
    idle_timeout: 20,
    connect_timeout: 10,
  });
  _db = drizzle(client, { schema });
  return _db;
}

const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return getDb()[prop as keyof ReturnType<typeof drizzle>];
  },
});

export default db;
