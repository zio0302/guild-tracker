/**
 * MGF.GG 스크래퍼 (병렬 버전)
 * 길드 페이지에서 멤버 목록 추출 → 캐릭터 페이지 5개씩 병렬 요청
 * 순차 방식(1~3분) → 병렬 방식(~20초)으로 대폭 단축
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
  scrapedAt: string;        // ISO 문자열 (표시용)
  scrapedAtKST: string;     // "2026년 3월 17일 12시 30분" 형식
}

const BASE_URL = 'https://www.mgf.gg';
const CONCURRENCY = 5;  // 동시 요청 수 (서버 부하 vs 속도 트레이드오프)
const DELAY_MS = 200;   // 배치 간 딜레이 (ms)

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

/** 길드 이름으로 전체 길드원 정보를 수집 (병렬 요청) */
export async function scrapeGuildPage(guildName: string): Promise<ScrapedGuildInfo> {
  const url = `${BASE_URL}/contents/guild_info.php?g_name=${encodeURIComponent(guildName)}`;
  console.log(`🔍 길드 페이지 스크래핑: ${url}`);

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`길드 페이지 요청 실패: ${res.status}`);

  const $ = cheerio.load(await res.text());

  // 서버 정보 추출 (OG description: "전투력 69조 · Scania 82 · 29명")
  const ogDesc = $('meta[property="og:description"]').attr('content') ?? '';
  const serverMatch = ogDesc.match(/([A-Za-z가-힣]+\s*\d*)\s*·\s*\d+명/);
  const server = serverMatch?.[1]?.trim() ?? '알 수 없음';

  // 멤버 닉네임 목록 추출 (중복 제거, 🔍 아이콘 링크 제외)
  const nicknames = new Set<string>();
  $('a[href*="character.php?n="]').each((_, el) => {
    const text = $(el).text().trim();
    // 🔍 아이콘이 포함된 링크 및 빈 텍스트 제외
    if (text && !text.includes('🔍') && text.length > 0) {
      nicknames.add(text);
    }
  });

  console.log(`👥 감지된 길드원: ${nicknames.size}명 → 병렬 수집 시작`);

  // 캐릭터 페이지를 CONCURRENCY개씩 병렬로 요청
  const members: ScrapedMember[] = [];
  const nicknameArr = Array.from(nicknames);

  for (let i = 0; i < nicknameArr.length; i += CONCURRENCY) {
    const batch = nicknameArr.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(nick => scrapeCharacterPage(nick))
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled') {
        members.push(r.value);
      } else {
        console.warn(`⚠️ ${batch[j]} 수집 실패:`, r.reason);
        members.push({ nickname: batch[j], job: '알 수 없음', level: 0, combatPower: '0' });
      }
    }

    // 배치 간 짧은 딜레이 (서버 부하 방지)
    if (i + CONCURRENCY < nicknameArr.length) {
      await delay(DELAY_MS);
    }
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

/** 캐릭터 개별 페이지에서 전투력/직업/레벨 파싱 */
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

  // 레벨: OG title "왕바부 - Lv.82 - MGF.GG"
  const title = $('meta[property="og:title"]').attr('content') ?? '';
  const levelMatch = title.match(/Lv\.(\d+)/i);
  const level = parseInt(levelMatch?.[1] ?? '0', 10);

  return { nickname, job, level, combatPower };
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
