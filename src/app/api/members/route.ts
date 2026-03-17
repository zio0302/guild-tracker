/**
 * GET  /api/members - 현재 활성 길드원 + 7일전/30일전 전투력 + 성장률
 * POST /api/members - 수동 스크래핑 트리거
 */
import { NextResponse } from 'next/server';
import { eq, and, gte, lte, inArray } from 'drizzle-orm';
import db from '@/db/client';
import { guildMembers, combatPowerSnapshots } from '@/db/schema';
import { formatCombatPower, getTodayKST, getDateDaysAgo, calcPowerDelta } from '@/lib/combatPower';
import { collectDailySnapshot } from '@/lib/snapshotService';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const today = getTodayKST();
    const date7ago = getDateDaysAgo(7);
    const date30ago = getDateDaysAgo(30);

    // 활성 멤버 목록
    const members = await db
      .select()
      .from(guildMembers)
      .where(eq(guildMembers.status, 'active'));

    if (members.length === 0) return NextResponse.json({ members: [], collectedAt: null });

    const memberIds = members.map((m) => m.id);

    // 오늘~30일전 스냅샷 일괄 조회 (N+1 방지)
    const snapshots = await db
      .select()
      .from(combatPowerSnapshots)
      .where(
        and(
          inArray(combatPowerSnapshots.memberId, memberIds),
          gte(combatPowerSnapshots.snapshotDate, date30ago),
          lte(combatPowerSnapshots.snapshotDate, today),
        )
      );

    // 멤버별 스냅샷 그룹핑
    const snapsByMember = new Map<number, typeof snapshots>();
    for (const snap of snapshots) {
      const existing = snapsByMember.get(snap.memberId) ?? [];
      existing.push(snap);
      snapsByMember.set(snap.memberId, existing);
    }

    // 특정 날짜에 가장 가까운(이전) 스냅샷 찾기
    const findClosest = (memberSnaps: typeof snapshots, targetDate: string) =>
      memberSnaps
        .filter(s => s.snapshotDate <= targetDate)
        .sort((a, b) => (a.snapshotDate > b.snapshotDate ? -1 : 1))[0] ?? null;

    const result = members.map((m) => {
      const memberSnaps = snapsByMember.get(m.id) ?? [];

      const todaySnap  = findClosest(memberSnaps, today);
      const snap7ago   = findClosest(memberSnaps, date7ago);
      const snap30ago  = findClosest(memberSnaps, date30ago);

      const currentPower   = todaySnap?.combatPower   ?? null;
      const power7DaysAgo  = snap7ago?.combatPower    ?? null;
      const power30DaysAgo = snap30ago?.combatPower   ?? null;

      // 7일 성장량 & 성장률
      const growth7d = currentPower && power7DaysAgo
        ? calcPowerDelta(currentPower, power7DaysAgo) : null;
      const growth7dRate = growth7d && power7DaysAgo && BigInt(power7DaysAgo) > 0n
        ? parseFloat((Number(BigInt(growth7d) * 10000n / BigInt(power7DaysAgo)) / 100).toFixed(2))
        : null;

      // 30일 성장량
      const growth30d = currentPower && power30DaysAgo
        ? calcPowerDelta(currentPower, power30DaysAgo) : null;

      return {
        id: m.id,
        nickname: m.currentNickname,
        job: m.job,
        server: m.server,
        nicknameHistory: JSON.parse(m.nicknameHistory) as string[],
        firstSeenAt: m.firstSeenAt,
        level: todaySnap?.level ?? null,
        // 현재 전투력
        combatPower: currentPower,
        combatPowerFormatted: currentPower ? formatCombatPower(currentPower) : '데이터 없음',
        // 7일 전
        power7DaysAgo,
        power7DaysAgoFormatted: power7DaysAgo ? formatCombatPower(power7DaysAgo) : '-',
        // 30일 전
        power30DaysAgo,
        power30DaysAgoFormatted: power30DaysAgo ? formatCombatPower(power30DaysAgo) : '-',
        // 7일 성장
        growth7d,
        growth7dFormatted: growth7d ? formatCombatPower(growth7d) : '-',
        growth7dRate,
        // 30일 성장
        growth30d,
        growth30dFormatted: growth30d ? formatCombatPower(growth30d) : '-',
        // 전일 대비
        powerDelta: todaySnap?.powerDelta ?? null,
        powerDeltaFormatted: todaySnap?.powerDelta ? formatCombatPower(todaySnap.powerDelta) : null,
      };
    });

    // 현재 전투력 높은 순 정렬
    result.sort((a, b) => {
      if (!a.combatPower) return 1;
      if (!b.combatPower) return -1;
      return BigInt(b.combatPower) > BigInt(a.combatPower) ? 1 : -1;
    });

    // 가장 최근 스냅샷의 수집 시각 (KST 포맷)
    const latestSnap = snapshots.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    let collectedAt: string | null = null;
    if (latestSnap?.createdAt) {
      const kst = new Date(new Date(latestSnap.createdAt).getTime() + 9 * 60 * 60 * 1000);
      collectedAt = kst.toLocaleString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }) + ' 기준';
    }

    return NextResponse.json({ members: result, collectedAt });
  } catch (err) {
    console.error('[GET /api/members]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await collectDailySnapshot();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[POST /api/members]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
