/**
 * MGF.GG 스크래퍼
 * 길드 목록 페이지 → 닉네임 수집 → 캐릭터 개별 페이지에서 전투력/직업/레벨 파싱
 */
import * as cheerio from 'cheerio';
import { parseCombatPower } from '@/lib/combatPower';

export interface ScrapedMember {
  nickname: string;
  job: string;
  level: number;
  combatPower: string;
}

export interface ScrapedGuildInfo {
  guildName: string;
  server: string;
  members: ScrapedMember[];
  scrapedAt: string;
}

const BASE_URL = 'https://www.mgf.gg';
const REQUEST_DELAY_MS = 600; // 요청 간 딜레이 (서버 부하 방지)

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

/** 길드 이름으로 전체 길드원 정보를 수집한다 */
export async function scrapeGuildPage(guildName: string): Promise<ScrapedGuildInfo> {
  const url = `${BASE_URL}/contents/guild_info.php?g_name=${encodeURIComponent(guildName)}`;
  console.log(`🔍 스크래핑 시작: ${url}`);

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`길드 페이지 요청 실패: ${res.status}`);

  const $ = cheerio.load(await res.text());

  // OG description에서 서버 정보 추출
  // 예: "전투력 69조 341억 · Scania 82 · 29명"
  const ogDesc = $('meta[property="og:description"]').attr('content') ?? '';
  const serverMatch = ogDesc.match(/([A-Za-z가-힣]+\s*\d+)\s*·/);
  const server = serverMatch?.[1]?.trim() ?? '알 수 없음';

  // 닉네임 링크 수집 (중복 제거)
  const nicknames = new Set<string>();
  $('a[href*="character.php?n="]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const text = $(el).text().trim();
    if (text && !text.includes('🔍')) {
      const encoded = href.split('n=')[1];
      if (encoded) nicknames.add(decodeURIComponent(encoded));
    }
  });

  console.log(`👥 감지된 길드원 수: ${nicknames.size}명`);

  // 각 닉네임별로 캐릭터 페이지 개별 요청
  const members: ScrapedMember[] = [];
  for (const nickname of nicknames) {
    try {
      const member = await scrapeCharacterPage(nickname);
      members.push(member);
    } catch (err) {
      console.warn(`⚠️ ${nickname} 수집 실패:`, err);
      members.push({ nickname, job: '알 수 없음', level: 0, combatPower: '0' });
    }
    await delay(REQUEST_DELAY_MS);
  }

  return {
    guildName,
    server,
    members,
    scrapedAt: new Date().toISOString(),
  };
}

/** 캐릭터 개별 페이지에서 전투력/직업/레벨을 파싱한다 */
async function scrapeCharacterPage(nickname: string): Promise<ScrapedMember> {
  const url = `${BASE_URL}/contents/character.php?n=${encodeURIComponent(nickname)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`캐릭터 페이지 요청 실패: ${res.status}`);

  const $ = cheerio.load(await res.text());

  // OG description 예시: "20조 1853억 · Scania 82 · 아크메이지(불,독) · 바부들"
  const ogDesc = $('meta[property="og:description"]').attr('content') ?? '';
  const parts = ogDesc.split('·').map(p => p.trim());

  const combatPower = parts[0] ? parseCombatPower(parts[0]) : '0';
  const job = parts[2] ?? '알 수 없음';

  // 레벨은 OG title에서 파싱 (예: "왕바부 - Lv.82 - MGF.GG")
  const title = $('meta[property="og:title"]').attr('content') ?? '';
  const levelMatch = title.match(/Lv\.(\d+)/i);
  const level = parseInt(levelMatch?.[1] ?? '0', 10);

  return { nickname, job, level, combatPower };
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
