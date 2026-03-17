/**
 * 멤버 상세 페이지 — 개별 멤버의 전투력 추이 차트 + 닉네임 이력
 */
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface GrowthData {
  member: {
    id: number;
    nickname: string;
    job: string;
    server: string;
    nicknameHistory: string[];
  };
  snapshots: {
    date: string;
    combatPowerFormatted: string;
    combatPower: string;
    level: number;
    deltaFormatted: string | null;
  }[];
}

const PERIOD_OPTIONS = [
  { label: '1주일', days: 7 },
  { label: '1개월', days: 30 },
  { label: '3개월', days: 90 },
  { label: '전체', days: 365 },
];

function getDateRange(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

export default function MemberDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<GrowthData | null>(null);
  const [period, setPeriod] = useState(1); // 기본 1개월
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { from, to } = getDateRange(PERIOD_OPTIONS[period].days);
    setLoading(true);
    fetch(`/api/members/${params.id}/growth?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); });
  }, [params.id, period]);

  if (loading) {
    return <div className="text-center py-20 text-gray-500">로딩 중...</div>;
  }

  if (!data) return null;

  const chartData = data.snapshots.map(s => ({
    date: s.date,
    power: Number(BigInt(s.combatPower) / 100_000_000n), // 억 단위로 표시
    label: s.combatPowerFormatted,
  }));

  return (
    <div className="space-y-8">
      {/* 뒤로가기 */}
      <a href="/" className="text-sm text-gray-400 hover:text-white transition-colors">
        ← 대시보드로 돌아가기
      </a>

      {/* 멤버 정보 헤더 */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-maple-700 rounded-xl flex items-center justify-center text-2xl">
            ⚔️
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">{data.member.nickname}</h2>
            <p className="text-gray-400 mt-0.5">{data.member.job} · {data.member.server}</p>
            {data.member.nicknameHistory.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                이전 닉네임: {data.member.nicknameHistory.join(' → ')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 기간 선택 */}
      <div className="flex gap-2">
        {PERIOD_OPTIONS.map((opt, i) => (
          <button
            key={opt.label}
            onClick={() => setPeriod(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              period === i
                ? 'bg-maple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 전투력 추이 차트 */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h3 className="text-sm font-medium text-gray-400 mb-4">전투력 추이 (억 단위)</h3>
        {chartData.length < 2 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            데이터가 부족합니다 (최소 2일치 필요)
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                labelStyle={{ color: '#F9FAFB' }}
                formatter={(_v: unknown, _: string, props: { payload?: { label?: string } }) => [props?.payload?.label ?? '', '전투력']}
              />
              <Line
                type="monotone"
                dataKey="power"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ fill: '#ef4444', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 스냅샷 테이블 */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left py-3 px-4 text-gray-400 font-medium">날짜</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">전투력</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">변화량</th>
              <th className="text-right py-3 px-4 text-gray-400 font-medium">레벨</th>
            </tr>
          </thead>
          <tbody>
            {[...data.snapshots].reverse().map(s => {
              const isPos = s.deltaFormatted && !s.deltaFormatted.startsWith('-');
              return (
                <tr key={s.date} className="border-b border-gray-800/50">
                  <td className="py-3 px-4 text-gray-300">{s.date}</td>
                  <td className="py-3 px-4 text-right font-mono text-gray-200">{s.combatPowerFormatted}</td>
                  <td className={`py-3 px-4 text-right font-mono font-medium ${
                    !s.deltaFormatted ? 'text-gray-500'
                    : isPos ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {s.deltaFormatted ? `${isPos ? '+' : ''}${s.deltaFormatted}` : '-'}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-400">{s.level}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
