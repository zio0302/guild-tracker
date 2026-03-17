/**
 * GET /api/members/[id]/growth?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 특정 멤버의 기간별 전투력 성장 이력을 반환한다.
 */
import { NextResponse } from 'next/server';
import { eq, and, gte, lte } from 'drizzle-orm';
import db from '@/db/client';
import { guildMembers, combatPowerSnapshots } from '@/db/schema';
import { formatCombatPower } from '@/lib/combatPower';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const memberId = parseInt(id, 10);
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  try {
    const [member] = await db
      .select()
      .from(guildMembers)
      .where(eq(guildMembers.id, memberId))
      .limit(1);

    if (!member) {
      return NextResponse.json({ error: '멤버를 찾을 수 없습니다.' }, { status: 404 });
    }

    const conditions = [eq(combatPowerSnapshots.memberId, memberId)];
    if (from) conditions.push(gte(combatPowerSnapshots.snapshotDate, from));
    if (to) conditions.push(lte(combatPowerSnapshots.snapshotDate, to));

    const snapshots = await db
      .select()
      .from(combatPowerSnapshots)
      .where(and(...conditions))
      .orderBy(combatPowerSnapshots.snapshotDate);

    return NextResponse.json({
      member: {
        id: member.id,
        nickname: member.currentNickname,
        job: member.job,
        server: member.server,
        nicknameHistory: JSON.parse(member.nicknameHistory) as string[],
      },
      snapshots: snapshots.map(s => ({
        date: s.snapshotDate,
        combatPower: s.combatPower,
        combatPowerFormatted: formatCombatPower(s.combatPower),
        level: s.level,
        delta: s.powerDelta,
        deltaFormatted: s.powerDelta ? formatCombatPower(s.powerDelta) : null,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
