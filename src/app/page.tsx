/**
 * 메인 대시보드 — 7일전/20일전 전투력 + 7일 성장률 테이블
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ── 타입 ──────────────────────────────────────────────
interface MemberData {
  id: number;
  nickname: string;
  job: string;
  level: number | null;
  combatPower: string | null;
  combatPowerFormatted: string;
  power7DaysAgo: string | null;
  power7DaysAgoFormatted: string;
  power20DaysAgo: string | null;
  power20DaysAgoFormatted: string;
  growth7d: string | null;
  growth7dRate: number | null;
  powerDeltaFormatted: string | null;
}

type SortKey = 'combatPower' | 'growth7dRate' | 'nickname';

// 성장률에 따른 색상
function rateColor(rate: number | null) {
  if (rate === null) return 'text-gray-500';
  if (rate >= 5)  return 'text-emerald-400 font-bold';
  if (rate >= 2)  return 'text-green-400';
  if (rate >= 0)  return 'text-blue-400';
  return 'text-red-400';
}

export default function DashboardPage() {
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('combatPower');
  const [collectStatus, setCollectStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [collectMsg, setCollectMsg] = useState('');
  const [collectedAt, setCollectedAt] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 데이터 로드 ──────────────────────────────────────
  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/members');
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.members ?? []);
      setMembers(list);
      if (data.collectedAt) setCollectedAt(data.collectedAt);
      setLastUpdated(new Date().toLocaleString('ko-KR'));
      return list.length;
    } catch {
      setMembers([]);
      return 0;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // ── 수동 수집 ─────────────────────────────────────────
  const handleCollect = async () => {
    if (collectStatus === 'running') return;
    setCollectStatus('running');
    setCollectMsg('MGF.GG에서 수집 중... (~20초 소요)');

    fetch('/api/members', { method: 'POST' })
      .then(async (res) => {
        const data = await res.json();
        if (data.success) {
          setCollectStatus('success');
          setCollectMsg(`✅ 수집 완료 — ${data.memberCount ?? 0}명 업데이트`);
        } else throw new Error(data.error);
      })
      .catch((err) => {
        setCollectStatus('error');
        setCollectMsg(`❌ 오류: ${err.message}`);
      })
      .finally(() => fetchMembers());

    // 5초마다 폴링
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const cnt = await fetchMembers();
      if (cnt > 0) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
      }
    }, 5000);
    setTimeout(() => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }, 120_000);
  };

  // ── 정렬 ──────────────────────────────────────────────
  const sorted = [...members].sort((a, b) => {
    if (sortKey === 'nickname') return a.nickname.localeCompare(b.nickname);
    if (sortKey === 'growth7dRate') {
      if (a.growth7dRate === null) return 1;
      if (b.growth7dRate === null) return -1;
      return b.growth7dRate - a.growth7dRate;
    }
    if (!a.combatPower) return 1;
    if (!b.combatPower) return -1;
    return BigInt(b.combatPower) > BigInt(a.combatPower) ? 1 : -1;
  });

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => setSortKey(k)}
      className={`px-3 py-1 text-xs rounded-full transition-colors ${
        sortKey === k ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* ── 헤더 ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white">길드원 전투력 현황</h2>
          {collectedAt && (
            <p className="text-xs text-yellow-400/80 mt-0.5 font-medium">📅 {collectedAt}</p>
          )}
          {lastUpdated && (
            <p className="text-xs text-gray-600 mt-0.5">페이지 갱신: {lastUpdated}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            onClick={handleCollect}
            disabled={collectStatus === 'running'}
            className={`px-5 py-2 text-sm font-semibold rounded-xl transition-all ${
              collectStatus === 'running'
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-500 active:scale-95 text-white'
            }`}
          >
            {collectStatus === 'running' ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-white rounded-full animate-spin" />
                수집 중...
              </span>
            ) : '🔄 지금 수집'}
          </button>
          {collectMsg && (
            <p className={`text-xs ${
              collectStatus === 'error' ? 'text-red-400'
              : collectStatus === 'success' ? 'text-green-400'
              : 'text-gray-400 animate-pulse'
            }`}>{collectMsg}</p>
          )}
        </div>
      </div>

      {/* ── 정렬 ── */}
      <div className="flex gap-2 flex-wrap">
        <span className="text-xs text-gray-500 self-center">정렬:</span>
        <SortBtn k="combatPower" label="현재 전투력 ↓" />
        <SortBtn k="growth7dRate" label="7일 성장률 ↓" />
        <SortBtn k="nickname"    label="이름순" />
      </div>

      {/* ── 요약 카드 ── */}
      {!loading && members.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '총 길드원', value: `${members.length}명` },
            { label: '데이터 보유', value: `${members.filter(m => m.combatPower).length}명` },
            { label: '7일 성장률 TOP', value: sorted.find(m => m.growth7dRate !== null)?.nickname ?? '-' },
            {
              label: '평균 성장률',
              value: (() => {
                const valid = members.filter(m => m.growth7dRate !== null);
                if (!valid.length) return '-';
                const avg = valid.reduce((s, m) => s + m.growth7dRate!, 0) / valid.length;
                return `${avg.toFixed(1)}%`;
              })()
            },
          ].map(card => (
            <div key={card.label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-xs text-gray-500">{card.label}</p>
              <p className="text-lg font-bold text-white mt-1">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── 테이블 ── */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-400">
              <th className="text-left py-3 px-4 w-8">#</th>
              <th className="text-left py-3 px-4">닉네임</th>
              <th className="text-left py-3 px-3">직업</th>
              <th className="text-right py-3 px-4">현재 전투력</th>
              <th className="text-right py-3 px-4 text-blue-400">7일 전</th>
              <th className="text-right py-3 px-4 text-purple-400">20일 전</th>
              <th className="text-right py-3 px-3 text-emerald-400">7일 성장률</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-gray-500">
                  <div className="flex items-center justify-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
                    불러오는 중...
                  </div>
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-gray-500">
                  <p className="text-base">아직 데이터가 없습니다</p>
                  <p className="text-xs mt-2 text-gray-600">
                    <span className="text-red-400 font-bold">🔄 지금 수집</span> 버튼을 눌러 첫 데이터를 수집하세요
                  </p>
                </td>
              </tr>
            ) : sorted.map((m, idx) => (
              <tr
                key={m.id}
                onClick={() => window.location.href = `/members/${m.id}`}
                className="border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors cursor-pointer"
              >
                <td className="py-3 px-4 text-gray-500">{idx + 1}</td>
                <td className="py-3 px-4">
                  <span className="font-semibold text-white">{m.nickname}</span>
                  {m.level && <span className="ml-2 text-xs text-gray-500">Lv.{m.level}</span>}
                </td>
                <td className="py-3 px-3 text-gray-400 text-xs max-w-[100px] truncate">{m.job}</td>
                <td className="py-3 px-4 text-right font-mono text-white">
                  {m.combatPowerFormatted}
                </td>
                <td className="py-3 px-4 text-right font-mono text-blue-300 text-xs">
                  {m.power7DaysAgoFormatted}
                </td>
                <td className="py-3 px-4 text-right font-mono text-purple-300 text-xs">
                  {m.power20DaysAgoFormatted}
                </td>
                <td className={`py-3 px-3 text-right text-xs font-bold ${rateColor(m.growth7dRate)}`}>
                  {m.growth7dRate !== null
                    ? `${m.growth7dRate > 0 ? '+' : ''}${m.growth7dRate}%`
                    : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && sorted.length > 0 && (
        <p className="text-xs text-gray-600 text-center">클릭하면 상세 전투력 추이를 볼 수 있습니다</p>
      )}
    </div>
  );
}
