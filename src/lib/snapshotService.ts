/**
 * 스냅샷 수집 핵심 서비스
 * API Route나 Cron에서 호출하여 스크래핑 → 변동 감지 → DB 저장을 처리한다.
 */
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import db from '@/db/client';
import {
  guildMembers,
  combatPowerSnapshots,
  guildEvents,
  type NewGuildMember,
} from '@/db/schema';
import { scrapeGuildPage } from '@/lib/mgfScraper';
import { analyzeGuildChanges, type MemberSnapshot } from '@/lib/memberMatcher';
import { calcPowerDelta, getTodayKST } from '@/lib/combatPower';

const GUILD_NAME = process.env.GUILD_NAME ?? '바부들';

/** 메인 수집 함수 */
export async function collectDailySnapshot() {
  const today = getTodayKST();
  console.log(`\n📅 [${today}] 스냅샷 수집 시작`);

  const guildData = await scrapeGuildPage(GUILD_NAME);
  console.log(`✅ 스크래핑 완료: ${guildData.members.length}명`);

  // DB의 현재 active 멤버 조회
  const activeMembersInDB = await db
    .select()
    .from(guildMembers)
    .where(eq(guildMembers.status, 'active'));

  // 변동 감지 알고리즘 실행
  const prevSnapshots: MemberSnapshot[] = activeMembersInDB.map(m => ({
    nickname: m.currentNickname,
    server: m.server,
    job: m.job,
    combatPower: '0',
    level: 0,
  }));

  const currSnapshots: MemberSnapshot[] = guildData.members.map(m => ({
    nickname: m.nickname,
    server: guildData.server,
    job: m.job,
    combatPower: m.combatPower,
    level: m.level,
  }));

  const { matchResults, confirmedLeft, confirmedJoined } = analyzeGuildChanges(
    prevSnapshots,
    currSnapshots,
  );

  // 1) 닉네임 변경 처리
  for (const match of matchResults) {
    const dbMember = activeMembersInDB.find(
      m => m.currentNickname === match.leavingMember.nickname,
    );
    if (!dbMember) continue;

    const history: string[] = JSON.parse(dbMember.nicknameHistory);
    history.push(dbMember.currentNickname);

    await db.update(guildMembers)
      .set({
        currentNickname: match.newMember.nickname,
        nicknameHistory: JSON.stringify(history),
        lastSeenAt: today,
        updatedAt: new Date(),
      })
      .where(eq(guildMembers.id, dbMember.id));

    await db.insert(guildEvents).values({
      memberId: dbMember.id,
      eventType: 'nickname_changed',
      oldValue: match.leavingMember.nickname,
      newValue: match.newMember.nickname,
      confidence: match.confidence,
      isConfirmed: false, // 관리자 확인 필요
      note: `자동 감지 - 판별 근거: ${match.reason}`,
    });

    console.log(`🔄 닉변 추정: "${match.leavingMember.nickname}" → "${match.newMember.nickname}" (${(match.confidence * 100).toFixed(0)}%)`);
  }

  // 2) 탈퇴 처리
  for (const left of confirmedLeft) {
    const dbMember = activeMembersInDB.find(m => m.currentNickname === left.nickname);
    if (!dbMember) continue;

    await db.update(guildMembers)
      .set({ status: 'left', leftAt: today, updatedAt: new Date() })
      .where(eq(guildMembers.id, dbMember.id));

    await db.insert(guildEvents).values({
      memberId: dbMember.id,
      eventType: 'left',
      oldValue: left.nickname,
      confidence: 1.0,
      isConfirmed: true,
    });

    console.log(`👋 탈퇴: "${left.nickname}"`);
  }

  // 3) 신규 가입 처리
  for (const joined of confirmedJoined) {
    // 같은 닉네임으로 이전에 탈퇴한 기록이 있으면 재가입으로 처리
    const prevLeft = await db
      .select()
      .from(guildMembers)
      .where(and(
        eq(guildMembers.currentNickname, joined.nickname),
        eq(guildMembers.status, 'left'),
      ))
      .limit(1);

    if (prevLeft.length > 0) {
      await db.update(guildMembers)
        .set({ status: 'active', leftAt: null, lastSeenAt: today, updatedAt: new Date() })
        .where(eq(guildMembers.id, prevLeft[0].id));

      await db.insert(guildEvents).values({
        memberId: prevLeft[0].id,
        eventType: 'rejoined',
        newValue: joined.nickname,
        confidence: 1.0,
        isConfirmed: true,
      });
      console.log(`🔙 재가입: "${joined.nickname}"`);
    } else {
      // 완전 신규
      const newMember: NewGuildMember = {
        currentNickname: joined.nickname,
        nicknameHistory: '[]',
        server: guildData.server,
        job: joined.job,
        status: 'active',
        firstSeenAt: today,
        lastSeenAt: today,
      };
      const [inserted] = await db.insert(guildMembers).values(newMember).returning();

      await db.insert(guildEvents).values({
        memberId: inserted.id,
        eventType: 'joined',
        newValue: joined.nickname,
        confidence: 1.0,
        isConfirmed: true,
      });
      console.log(`✨ 신규 가입: "${joined.nickname}" (${joined.job})`);
    }
  }

  // 4) 전투력 스냅샷 저장 (오늘 + 과거 히스토리 포함)
  const scrapedMap = new Map(guildData.members.map(m => [m.nickname, m]));
  const freshActiveMembers = await db
    .select()
    .from(guildMembers)
    .where(eq(guildMembers.status, 'active'));

  for (const member of freshActiveMembers) {
    const scraped = scrapedMap.get(member.currentNickname);
    if (!scraped) continue;

    // 직전 스냅샷 조회 (전일 대비 delta 계산용)
    const [prevSnap] = await db
      .select()
      .from(combatPowerSnapshots)
      .where(eq(combatPowerSnapshots.memberId, member.id))
      .orderBy(desc(combatPowerSnapshots.snapshotDate))
      .limit(1);

    // 오늘 스냅샷 UPSERT
    await db.insert(combatPowerSnapshots)
      .values({
        memberId: member.id,
        combatPower: scraped.combatPower,
        level: scraped.level,
        snapshotDate: today,
        powerDelta: prevSnap ? calcPowerDelta(scraped.combatPower, prevSnap.combatPower) : null,
      })
      .onConflictDoUpdate({
        target: [combatPowerSnapshots.memberId, combatPowerSnapshots.snapshotDate],
        set: {
          combatPower: scraped.combatPower,
          level: scraped.level,
          powerDelta: prevSnap ? calcPowerDelta(scraped.combatPower, prevSnap.combatPower) : null,
          createdAt: new Date(),
        },
      });

    // 과거 히스토리 UPSERT (오늘 이전 날짜만)
    if (scraped.history && scraped.history.length > 0) {
      const pastHistory = scraped.history.filter(h => h.date < today && h.power !== '0');
      for (const hist of pastHistory) {
        await db.insert(combatPowerSnapshots)
          .values({
            memberId: member.id,
            combatPower: hist.power,
            level: scraped.level, // 과거 레벨은 알 수 없어 현재값 사용
            snapshotDate: hist.date,
            powerDelta: null,
          })
          .onConflictDoNothing(); // 이미 있으면 건너뜀 (덮어쓰지 않음)
      }
      console.log(`  📚 ${member.currentNickname}: 히스토리 ${pastHistory.length}건 저장`);
    }

    await db.update(guildMembers)
      .set({ lastSeenAt: today, updatedAt: new Date() })
      .where(eq(guildMembers.id, member.id));
  }

  console.log(`🎉 [${today}] 수집 완료!\n`);
  return { date: today, memberCount: freshActiveMembers.length };
}

