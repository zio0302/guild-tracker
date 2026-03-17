/**
 * 메인 대시보드 페이지 (서버 컴포넌트)
 * 길드원 전투력 성장 랭킹 + 기간 선택 + 수동 스크래핑 버튼
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ── 타입 정의 ──
interface MemberData {
  id: number;
  nickname: string;
  job: string;
  combatPowerFormatted: string;
  powerDelta: string | null;
  powerDeltaFormatted: string | null;
  level: number | null;
}

interface CompareData {
  id: number;
  nickname: string;
  job: string;
  growthFormatted: string | null;
  growth: string | null;
  toPowerFormatted: string | null;
}

const PERIOD_OPTIONS = [
  { label: '오늘', days: 0 },
  { label: '1주일', days: 7 },
  { label: '1개월', days: 30 },
  { label: '3개월', days: 90 },
];

function getDateRange(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { from: fmt(from), to: fmt(to) };
}

export default function DashboardPage() {
  const [members, setMembers] = useState<MemberData[]>([]);
  const [compareData, setCompareData] = useState<CompareData[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(0); // 인덱스
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // 기간에 따른 성장 랭킹 조회
  const fetchCompare = useCallback(async (days: number) => {
    if (days === 0) {
      // 오늘 기준: 오늘 delta만 사용
      return;
    }
    const { from, to } = getDateRange(days);
    const res = await fetch(`/api/snapshot/compare?from=${from}&to=${to}`);
    const data = await res.json();
    setCompareData(data);
  }, []);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/members');
      const data = await res.json();
      // API 오류 시 빈 배열로 처리 (크래시 방지)
      setMembers(Array.isArray(data) ? data : []);
      setLastUpdated(new Date().toLocaleString('ko-KR'));
    } catch (err) {
      console.error('멤버 데이터 로드 실패:', err);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    fetchCompare(PERIOD_OPTIONS[selectedPeriod].days);
  }, [selectedPeriod, fetchCompare]);

  // 수동 스크래핑
  const handleScrape = async () => {
    setScraping(true);
    try {
      await fetch('/api/members', { method: 'POST' });
      await fetchMembers();
      alert('✅ 수집 완료!');
    } catch {
      alert('❌ 수집 실패');
    } finally {
      setScraping(false);
    }
  };

  // 차트용 데이터 가공
  const displayData = selectedPeriod === 0
    ? members.slice(0, 15)
    : compareData.slice(0, 15);

  const chartData = displayData.map((m) => ({
    name: 'nickname' in m ? m.nickname : '',
    value: selectedPeriod === 0
      ? parseInt((m as MemberData).powerDelta ?? '0', 10) / 1e8  // 억 단위
      : parseInt((m as CompareData).growth ?? '0', 10) / 1e8,
    label: selectedPeriod === 0
      ? (m as MemberData).powerDeltaFormatted ?? '+0'
      : (m as CompareData).growthFormatted ?? '+0',
  }));

  return (
    <div className="space-y-8">
      {/* 헤더 섹션 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">전투력 성장 랭킹</h2>
          {lastUpdated && (
            <p className="text-sm text-gray-400 mt-1">마지막 업데이트: {lastUpdated}</p>
          )}
        </div>
        <button
          onClick={handleScrape}
          disabled={scraping}
          className="px-4 py-2 bg-maple-600 hover:bg-maple-700 disabled:bg-gray-700 
                     text-white text-sm font-medium rounded-lg transition-colors
                     disabled:cursor-not-allowed"
        >
          {scraping ? '⏳ 수집 중...' : '🔄 지금 수집'}
        </button>
      </div>

      {/* 기간 선택 탭 */}
      <div className="flex gap-2">
        {PERIOD_OPTIONS.map((opt, i) => (
          <button
            key={opt.label}
            onClick={() => setSelectedPeriod(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedPeriod === i
                ? 'bg-maple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 차트 */}
      {!loading && chartData.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 className="text-sm font-medium text-gray-400 mb-4">
            {PERIOD_OPTIONS[selectedPeriod].label} 성장량 (억 단위)
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                labelStyle={{ color: '#F9FAFB' }}
                formatter={(value: number) => [`${value.toFixed(1)}억`, '성장량']}
              />
              <Bar dataKey="value" fill="#d92626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 멤버 테이블 */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left py-3 px-4 text-gray-400 font-medium w-8">#</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">닉네임</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">직업</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">현재 전투력</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">
                {PERIOD_OPTIONS[selectedPeriod].label} 성장
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-gray-500">
                  데이터 불러오는 중...
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-gray-500">
                  <div>
                    <p>데이터가 없습니다.</p>
                    <p className="text-xs mt-1">오른쪽 위 &apos;지금 수집&apos; 버튼을 눌러 시작하세요.</p>
                  </div>
                </td>
              </tr>
            ) : members.map((member, idx) => {
              const compareItem = compareData.find(c => c.id === member.id);
              const growthFormatted = selectedPeriod === 0
                ? member.powerDeltaFormatted
                : compareItem?.growthFormatted ?? null;
              const growth = selectedPeriod === 0
                ? member.powerDelta
                : compareItem?.growth ?? null;
              const isPositive = growth && !growth.startsWith('-');

              return (
                <tr
                  key={member.id}
                  className="border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors cursor-pointer"
                  onClick={() => window.location.href = `/members/${member.id}`}
                >
                  <td className="py-3 px-4 text-gray-500">{idx + 1}</td>
                  <td className="py-3 px-4 font-medium text-white">{member.nickname}</td>
                  <td className="py-3 px-4 text-gray-400">{member.job}</td>
                  <td className="py-3 px-4 text-right font-mono text-gray-200">
                    {member.combatPowerFormatted}
                  </td>
                  <td className={`py-3 px-4 text-right font-mono font-medium ${
                    !growth ? 'text-gray-500'
                    : isPositive ? 'text-green-400'
                    : 'text-red-400'
                  }`}>
                    {growth
                      ? `${isPositive ? '+' : ''}${growthFormatted}`
                      : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
