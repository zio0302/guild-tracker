/**
 * GET  /api/members - 현재 활성 길드원 목록 (오늘 전투력 포함)
 * POST /api/members/scrape - 수동 스크래핑 트리거
 */
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import db from '@/db/client';
import { guildMembers, combatPowerSnapshots } from '@/db/schema';
import { formatCombatPower, getTodayKST } from '@/lib/combatPower';
import { collectDailySnapshot } from '@/lib/snapshotService';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const today = getTodayKST();

    const members = await db
      .select()
      .from(guildMembers)
      .where(eq(guildMembers.status, 'active'));

    const result = await Promise.all(
      members.map(async (m) => {
        const [snap] = await db
          .select()
          .from(combatPowerSnapshots)
          .where(and(
            eq(combatPowerSnapshots.memberId, m.id),
            eq(combatPowerSnapshots.snapshotDate, today),
          ))
          .limit(1);

        return {
          id: m.id,
          nickname: m.currentNickname,
          job: m.job,
          server: m.server,
          nicknameHistory: JSON.parse(m.nicknameHistory) as string[],
          firstSeenAt: m.firstSeenAt,
          combatPower: snap?.combatPower ?? null,
          combatPowerFormatted: snap ? formatCombatPower(snap.combatPower) : '데이터 없음',
          level: snap?.level ?? null,
          powerDelta: snap?.powerDelta ?? null,
          powerDeltaFormatted: snap?.powerDelta
            ? formatCombatPower(snap.powerDelta)
            : null,
        };
      })
    );

    // 전투력 높은 순 정렬
    result.sort((a, b) => {
      if (!a.combatPower) return 1;
      if (!b.combatPower) return -1;
      return BigInt(b.combatPower) > BigInt(a.combatPower) ? 1 : -1;
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await collectDailySnapshot();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
