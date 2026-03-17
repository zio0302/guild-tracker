/**
 * MGF.GG 스크래퍼 (병렬 버전 + 히스토리 파싱)
 * 캐릭터 페이지 HTML의 ApexCharts inline JS에서 날짜별 전투력 이력 추출
 */
import * as cheerio from 'cheerio';
import { parseCombatPower } from '@/lib/combatPower';

export interface ScrapedMember {
  nickname: string;
  job: string;
  level: number;
  combatPower: string;
  history: CharacterHistory[]; // 과거 날짜별 전투력
}

export interface CharacterHistory {
  date: string;  // "YYYY-MM-DD"
  power: string; // raw 숫자 문자열
}

export interface ScrapedGuildInfo {
  guildName: string;
  server: string;
  members: ScrapedMember[];
  scrapedAt: string;
  scrapedAtKST: string;
}

const BASE_URL = 'https://www.mgf.gg';
const CONCURRENCY = 5;
const DELAY_MS = 200;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

/** 길드 이름으로 전체 길드원 정보 + 히스토리 수집 */
export async function scrapeGuildPage(guildName: string): Promise<ScrapedGuildInfo> {
  const url = `${BASE_URL}/contents/guild_info.php?g_name=${encodeURIComponent(guildName)}`;
  console.log(`🔍 길드 페이지 스크래핑: ${url}`);

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`길드 페이지 요청 실패: ${res.status}`);

  const $ = cheerio.load(await res.text());

  const ogDesc = $('meta[property="og:description"]').attr('content') ?? '';
  const serverMatch = ogDesc.match(/([A-Za-z가-힣]+\s*\d*)\s*·\s*\d+명/);
  const server = serverMatch?.[1]?.trim() ?? '알 수 없음';

  const nicknames = new Set<string>();
  $('a[href*="character.php?n="]').each((_, el) => {
    const text = $(el).text().trim();
    if (text && !text.includes('🔍')) nicknames.add(text);
  });

  console.log(`👥 감지된 길드원: ${nicknames.size}명 → 병렬 수집 시작`);

  const members: ScrapedMember[] = [];
  const nicknameArr = Array.from(nicknames);

  for (let i = 0; i < nicknameArr.length; i += CONCURRENCY) {
    const batch = nicknameArr.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(nick => scrapeCharacterPage(nick)));

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled') {
        members.push(r.value);
      } else {
        console.warn(`⚠️ ${batch[j]} 수집 실패:`, r.reason);
        members.push({ nickname: batch[j], job: '알 수 없음', level: 0, combatPower: '0', history: [] });
      }
    }

    if (i + CONCURRENCY < nicknameArr.length) await delay(DELAY_MS);
  }

  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  return {
    guildName,
    server,
    members,
    scrapedAt: now.toISOString(),
    scrapedAtKST: kst.toLocaleString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }),
  };
}

/** 캐릭터 개별 페이지에서 전투력/직업/레벨 + 과거 히스토리 파싱 */
async function scrapeCharacterPage(nickname: string): Promise<ScrapedMember> {
  const url = `${BASE_URL}/contents/character.php?n=${encodeURIComponent(nickname)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`캐릭터 페이지 요청 실패: ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  // OG description: "20조 1853억 · Scania 82 · 아크메이지(불,독) · 바부들"
  const ogDesc = $('meta[property="og:description"]').attr('content') ?? '';
  const parts = ogDesc.split('·').map(p => p.trim());

  const combatPower = parts[0] ? parseCombatPower(parts[0]) : '0';
  const job = parts[2] ?? '알 수 없음';

  // 레벨: OG title "왕바부 - Lv.82 - MGF.GG"
  const title = $('meta[property="og:title"]').attr('content') ?? '';
  const levelMatch = title.match(/Lv\.(\d+)/i);
  const level = parseInt(levelMatch?.[1] ?? '0', 10);

  // ── ApexCharts inline JS에서 히스토리 파싱 ──────────────
  // categories: ["02-21","02-22",...,"03-17"]
  // data: [1234567890,2345678901,...]
  const history: CharacterHistory[] = parseHistory(html);

  return { nickname, job, level, combatPower, history };
}

/** HTML에서 날짜+전투력 히스토리 파싱 */
export function parseHistory(html: string): CharacterHistory[] {
  const history: CharacterHistory[] = [];
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // 날짜 배열: categories: ["02-21","02-22",...]
    const catMatch = html.match(/categories:\s*\[([^\]]+)\]/);
    const dateStrings = catMatch
      ? (catMatch[1].match(/"(\d{2}-\d{2})"/g) ?? []).map(d => d.replace(/"/g, ''))
      : [];

    // 전투력 배열: data: [숫자,숫자,...]
    const dataMatch = html.match(/data:\s*\[([^\]]+)\]/);
    const powers = dataMatch
      ? dataMatch[1].split(',').map(s => s.trim()).filter(s => /^\d{5,}$/.test(s))
      : [];

    const len = Math.min(dateStrings.length, powers.length);
    for (let i = 0; i < len; i++) {
      const mmdd = dateStrings[i]; // "02-21"
      const [mm] = mmdd.split('-');
      const month = parseInt(mm, 10);
      // 월이 현재 월보다 크면 작년 데이터
      const year = month > currentMonth ? currentYear - 1 : currentYear;
      const dateStr = `${year}-${mmdd}`; // "2026-02-21"
      history.push({ date: dateStr, power: powers[i] });
    }
  } catch (e) {
    console.warn('히스토리 파싱 오류:', e);
  }
  return history;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
