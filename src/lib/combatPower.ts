/**
 * 전투력 유틸리티 함수
 * mgf.gg는 "X조 Y억 Z만" 한국어 단위를 사용한다.
 * JavaScript BigInt 정밀도 손실 없이 처리하기 위해 문자열로 저장한다.
 */

/** "20조 1853억" → "201853000000000" */
export function parseCombatPower(text: string): string {
  const 조 = BigInt(text.match(/(\d+)조/)?.[1] ?? 0) * 1_000_000_000_000n;
  const 억 = BigInt(text.match(/(\d+)억/)?.[1] ?? 0) * 100_000_000n;
  const 만 = BigInt(text.match(/(\d+)만/)?.[1] ?? 0) * 10_000n;
  return (조 + 억 + 만).toString();
}

/** "201853000000000" → "20조 1853억" */
export function formatCombatPower(powerStr: string): string {
  if (!powerStr || powerStr === '0') return '0';
  const isNeg = powerStr.startsWith('-');
  const abs = isNeg ? powerStr.slice(1) : powerStr;

  const power = BigInt(abs);
  const 조단위 = power / 1_000_000_000_000n;
  const 억단위 = (power % 1_000_000_000_000n) / 100_000_000n;
  const 만단위 = (power % 100_000_000n) / 10_000n;

  const parts: string[] = [];
  if (조단위 > 0n) parts.push(`${조단위}조`);
  if (억단위 > 0n) parts.push(`${억단위}억`);
  if (만단위 > 0n) parts.push(`${만단위}만`);

  return (isNeg ? '-' : '') + (parts.join(' ') || '0');
}

/** "201853000000000" → "20조 1853억" (만단위 생략 — 카드/히스토리 컬럼용) */
export function formatCombatPowerShort(powerStr: string): string {
  if (!powerStr || powerStr === '0') return '0';
  const isNeg = powerStr.startsWith('-');
  const abs = isNeg ? powerStr.slice(1) : powerStr;

  const power = BigInt(abs);
  const 조단위 = power / 1_000_000_000_000n;
  const 억단위 = (power % 1_000_000_000_000n) / 100_000_000n;

  const parts: string[] = [];
  if (조단위 > 0n) parts.push(`${조단위}조`);
  if (억단위 > 0n) parts.push(`${억단위}억`);

  return (isNeg ? '-' : '') + (parts.join(' ') || '0');
}

/** 두 전투력의 차이 계산 */
export function calcPowerDelta(current: string, previous: string): string {
  return (BigInt(current) - BigInt(previous)).toString();
}

/** 두 전투력이 허용 오차(%) 이내인지 확인 (닉변 판별용) */
export function isPowerSimilar(a: string, b: string, tolerancePercent = 5): boolean {
  const bigA = BigInt(a);
  const bigB = BigInt(b);
  if (bigA === 0n || bigB === 0n) return false;
  const diff = bigA > bigB ? bigA - bigB : bigB - bigA;
  const max = bigA > bigB ? bigA : bigB;
  return diff <= (max * BigInt(tolerancePercent)) / 100n;
}

/** 오늘 날짜를 "YYYY-MM-DD" 형식으로 반환 (KST) */
export function getTodayKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
}

/** N일 전 날짜를 "YYYY-MM-DD" 형식으로 반환 (KST) */
export function getDateDaysAgo(days: number): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000 - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
}
