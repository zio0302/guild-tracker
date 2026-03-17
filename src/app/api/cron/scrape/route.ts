/**
 * Vercel Cron Job Route
 * vercel.json에 설정된 스케줄(매일 UTC 15:00 = KST 00:00)에 Vercel이 자동으로 호출한다.
 *
 * 보안: Authorization 헤더에 CRON_SECRET이 있어야만 실행 (외부 임의 호출 방지)
 */
import { NextResponse } from 'next/server';
import { collectDailySnapshot } from '@/lib/snapshotService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel 최대 실행 시간 5분 (멤버가 많을 경우 대비)

export async function GET(request: Request) {
  // Vercel Cron은 Authorization: Bearer <CRON_SECRET> 헤더를 자동으로 추가한다
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const result = await collectDailySnapshot();
    return NextResponse.json({
      success: true,
      message: `스냅샷 수집 완료`,
      ...result,
    });
  } catch (error) {
    console.error('[Cron] 스냅샷 수집 실패:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
