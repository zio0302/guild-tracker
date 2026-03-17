/**
 * Drizzle ORM + postgres (Supabase 연결)
 * Lazy initialization: 빌드 시 DB 연결 시도를 막고, 실제 요청 시에만 연결한다.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.');
  }
  // postgres 패키지는 표준 PostgreSQL에 모두 연결 가능 (Supabase, Neon 등)
  // max: 1 → Vercel Serverless 환경에서 연결 풀 낭비 방지
  const { default: postgres } = require('postgres');
  const client = postgres(process.env.DATABASE_URL, { max: 1, ssl: 'require' });
  return drizzle(client, { schema });
}

let _db: ReturnType<typeof getDb> | null = null;

const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_target, prop) {
    if (!_db) _db = getDb();
    return _db[prop as keyof ReturnType<typeof getDb>];
  },
});

export default db;
