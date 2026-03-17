/**
 * GET /api/events - 길드 변동 이벤트 로그 (최근 100건)
 * PATCH /api/events/[id]/confirm - 이벤트 수동 재분류
 */
import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import db from '@/db/client';
import { guildEvents, guildMembers } from '@/db/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const events = await db
      .select({
        id: guildEvents.id,
        eventType: guildEvents.eventType,
        oldValue: guildEvents.oldValue,
        newValue: guildEvents.newValue,
        confidence: guildEvents.confidence,
        isConfirmed: guildEvents.isConfirmed,
        note: guildEvents.note,
        detectedAt: guildEvents.detectedAt,
        memberNickname: guildMembers.currentNickname,
        memberId: guildMembers.id,
      })
      .from(guildEvents)
      .leftJoin(guildMembers, eq(guildEvents.memberId, guildMembers.id))
      .orderBy(desc(guildEvents.detectedAt))
      .limit(100);

    return NextResponse.json(events);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
