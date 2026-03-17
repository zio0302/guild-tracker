/**
 * 닉네임 변경 vs 탈퇴/재가입 판별 알고리즘
 * 서버, 직업, 전투력 유사도를 기준으로 동일인 여부를 추정한다.
 */
import { isPowerSimilar } from './combatPower';

export interface MemberSnapshot {
  nickname: string;
  server: string;
  job: string;
  combatPower: string;
  level: number;
}

export interface MatchResult {
  leavingMember: MemberSnapshot;
  newMember: MemberSnapshot;
  confidence: number;
  reason: string;
  isNicknameChange: boolean;
}

const RENAME_THRESHOLD = 0.65; // 이 값 이상이면 닉변으로 판별

/**
 * 두 스냅샷을 비교하여 이탈/신규/닉변을 분류한다.
 */
export function analyzeGuildChanges(
  previousMembers: MemberSnapshot[],
  currentMembers: MemberSnapshot[],
) {
  const prevNicknames = new Set(previousMembers.map(m => m.nickname));
  const currNicknames = new Set(currentMembers.map(m => m.nickname));

  const leavingCandidates = previousMembers.filter(m => !currNicknames.has(m.nickname));
  const newCandidates = currentMembers.filter(m => !prevNicknames.has(m.nickname));

  const matchResults: MatchResult[] = [];
  const matchedNew = new Set<string>();
  const matchedOld = new Set<string>();

  for (const leaving of leavingCandidates) {
    let best: { member: MemberSnapshot; confidence: number; reason: string } | null = null;

    for (const newMember of newCandidates) {
      if (matchedNew.has(newMember.nickname)) continue;
      const { confidence, reason } = getConfidence(leaving, newMember);
      if (!best || confidence > best.confidence) {
        best = { member: newMember, confidence, reason };
      }
    }

    if (best && best.confidence >= RENAME_THRESHOLD) {
      matchResults.push({
        leavingMember: leaving,
        newMember: best.member,
        confidence: best.confidence,
        reason: best.reason,
        isNicknameChange: true,
      });
      matchedNew.add(best.member.nickname);
      matchedOld.add(leaving.nickname);
    }
  }

  return {
    matchResults,
    confirmedLeft: leavingCandidates.filter(m => !matchedOld.has(m.nickname)),
    confirmedJoined: newCandidates.filter(m => !matchedNew.has(m.nickname)),
  };
}

/**
 * [핵심] 두 멤버가 동일인일 신뢰도를 계산한다.
 *
 * 판별 기준 (설계서 기준):
 * - 서버 다름 → 즉시 0 (다른 서버면 불가능)
 * - 서버 동일 + 직업 동일 → 0.8
 * - 서버 동일 + 전투력 ±5% → 0.7
 * - 서버 동일 + 레벨 ±2 → 0.5
 */
function getConfidence(a: MemberSnapshot, b: MemberSnapshot) {
  if (a.server !== b.server) return { confidence: 0, reason: '서버 상이' };

  const reasons = ['서버 동일'];
  let confidence = 0;

  if (a.job === b.job && a.job !== '알 수 없음') {
    confidence = Math.max(confidence, 0.8);
    reasons.push('직업 동일');
  }
  if (isPowerSimilar(a.combatPower, b.combatPower, 5)) {
    confidence = Math.max(confidence, 0.7);
    reasons.push('전투력 유사(±5%)');
  }
  const levelDiff = Math.abs(a.level - b.level);
  if (levelDiff <= 2 && a.level > 0) {
    confidence = Math.max(confidence, 0.5);
    reasons.push(`레벨 근접(차이: ${levelDiff})`);
  }

  return { confidence, reason: reasons.join(', ') };
}
