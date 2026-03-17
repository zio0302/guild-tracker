/**
 * GET /api/snapshot/compare?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 두 날짜 사이의 전투력 성장량을 멤버별로 반환 (대시보드 랭킹용)
 */
import { NextResponse } from 'next/server';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import db from '@/db/client';
import { guildMembers, combatPowerSnapshots } from '@/db/schema';
import { formatCombatPower, getTodayKST } from '@/lib/combatPower';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const today = getTodayKST();
  // 기본값: 오늘 ~ 오늘 (기간 미지정 시)
  const from = searchParams.get('from') ?? today;
  const to = searchParams.get('to') ?? today;

  try {
    const activeMembers = await db
      .select()
      .from(guildMembers)
      .where(eq(guildMembers.status, 'active'));

    const comparisons = await Promise.all(
      activeMembers.map(async (m) => {
        // 기간 시작의 가장 첫 번째 스냅샷
        const [fromSnap] = await db
          .select()
          .from(combatPowerSnapshots)
          .where(and(
            eq(combatPowerSnapshots.memberId, m.id),
            gte(combatPowerSnapshots.snapshotDate, from),
          ))
          .orderBy(combatPowerSnapshots.snapshotDate)
          .limit(1);

        // 기간 끝의 가장 마지막 스냅샷
        const [toSnap] = await db
          .select()
          .from(combatPowerSnapshots)
          .where(and(
            eq(combatPowerSnapshots.memberId, m.id),
            lte(combatPowerSnapshots.snapshotDate, to),
          ))
          .orderBy(desc(combatPowerSnapshots.snapshotDate))
          .limit(1);

        const growth = fromSnap && toSnap
          ? (BigInt(toSnap.combatPower) - BigInt(fromSnap.combatPower)).toString()
          : null;

        return {
          id: m.id,
          nickname: m.currentNickname,
          job: m.job,
          fromPower: fromSnap?.combatPower ?? null,
          fromPowerFormatted: fromSnap ? formatCombatPower(fromSnap.combatPower) : null,
          toPower: toSnap?.combatPower ?? null,
          toPowerFormatted: toSnap ? formatCombatPower(toSnap.combatPower) : null,
          growth,
          growthFormatted: growth ? formatCombatPower(growth) : null,
        };
      })
    );

    // 성장량 높은 순 정렬
    comparisons.sort((a, b) => {
      if (!a.growth) return 1;
      if (!b.growth) return -1;
      const ag = BigInt(a.growth);
      const bg = BigInt(b.growth);
      return bg > ag ? 1 : -1;
    });

    return NextResponse.json(comparisons);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
