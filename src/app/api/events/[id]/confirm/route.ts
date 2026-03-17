/**
 * PATCH /api/events/[id]/confirm
 * 알고리즘이 추정한 닉변/탈퇴 이벤트를 관리자가 수동으로 최종 확인하는 엔드포인트
 */
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import db from '@/db/client';
import { guildEvents } from '@/db/schema';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const eventId = parseInt(id, 10);
  const body = await request.json() as { isNicknameChange: boolean; note?: string };

  try {
    await db.update(guildEvents)
      .set({
        eventType: body.isNicknameChange ? 'nickname_changed' : 'left',
        isConfirmed: true,
        confidence: 1.0,
        note: body.note ?? '관리자 수동 확인',
      })
      .where(eq(guildEvents.id, eventId));

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
