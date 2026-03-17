/**
 * 이벤트 로그 페이지
 * 길드원 탈퇴/가입/닉네임 변경 이력을 타임라인 형태로 보여준다.
 * 알고리즘이 추정한 닉변 이벤트는 관리자가 직접 확인/재분류할 수 있다.
 */
'use client';

import { useState, useEffect } from 'react';

interface EventItem {
  id: number;
  eventType: 'joined' | 'left' | 'nickname_changed' | 'rejoined';
  oldValue: string | null;
  newValue: string | null;
  confidence: number;
  isConfirmed: boolean;
  note: string | null;
  detectedAt: string;
  memberNickname: string | null;
  memberId: number | null;
}

const EVENT_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  joined:           { label: '신규 가입',     emoji: '✨', color: 'text-green-400' },
  left:             { label: '탈퇴',          emoji: '👋', color: 'text-red-400'   },
  rejoined:         { label: '재가입',        emoji: '🔙', color: 'text-blue-400'  },
  nickname_changed: { label: '닉네임 변경',   emoji: '🔄', color: 'text-yellow-400' },
};

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const fetchEvents = async () => {
    setLoading(true);
    const res = await fetch('/api/events');
    const data = await res.json();
    setEvents(data);
    setLoading(false);
  };

  useEffect(() => { fetchEvents(); }, []);

  // 관리자가 이벤트를 수동으로 재분류한다 (닉변 ↔ 탈퇴+재가입)
  const handleConfirm = async (id: number, isNicknameChange: boolean) => {
    setConfirmingId(id);
    await fetch(`/api/events/${id}/confirm`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isNicknameChange }),
    });
    await fetchEvents();
    setConfirmingId(null);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">이벤트 로그</h2>
        <p className="text-sm text-gray-400 mt-1">최근 100건의 길드 변동 기록</p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">로딩 중...</div>
      ) : events.length === 0 ? (
        <div className="text-center py-20 text-gray-500">이벤트가 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {events.map(event => {
            const meta = EVENT_LABELS[event.eventType];
            const needsReview = event.eventType === 'nickname_changed' && !event.isConfirmed;

            return (
              <div
                key={event.id}
                className={`bg-gray-900 rounded-xl p-5 border transition-colors ${
                  needsReview ? 'border-yellow-600/40 bg-yellow-900/10' : 'border-gray-800'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xl">{meta.emoji}</span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-semibold ${meta.color}`}>{meta.label}</span>
                        {/* 닉네임 변경: 이전 → 이후 */}
                        {event.eventType === 'nickname_changed' && (
                          <span className="text-gray-300 text-sm">
                            <span className="text-gray-400">{event.oldValue}</span>
                            <span className="mx-1 text-gray-500">→</span>
                            <span className="text-white font-medium">{event.newValue}</span>
                          </span>
                        )}
                        {event.eventType === 'left' && (
                          <span className="text-gray-300 text-sm">{event.oldValue}</span>
                        )}
                        {(event.eventType === 'joined' || event.eventType === 'rejoined') && (
                          <span className="text-gray-300 text-sm">{event.newValue}</span>
                        )}
                      </div>

                      {/* 알고리즘 신뢰도 표시 */}
                      {event.eventType === 'nickname_changed' && (
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            알고리즘 신뢰도: {(event.confidence * 100).toFixed(0)}%
                          </span>
                          {!event.isConfirmed && (
                            <span className="text-xs bg-yellow-700/40 text-yellow-300 px-2 py-0.5 rounded">
                              확인 필요
                            </span>
                          )}
                          {event.isConfirmed && (
                            <span className="text-xs bg-green-700/30 text-green-400 px-2 py-0.5 rounded">
                              ✓ 확인됨
                            </span>
                          )}
                        </div>
                      )}

                      {event.note && (
                        <p className="text-xs text-gray-500 mt-1">{event.note}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-gray-500">{formatDate(event.detectedAt)}</span>
                  </div>
                </div>

                {/* 닉변 추정 이벤트: 관리자 수동 확인 버튼 */}
                {needsReview && (
                  <div className="mt-4 pt-4 border-t border-yellow-700/20 flex gap-2">
                    <p className="text-xs text-yellow-300 mr-auto">
                      ⚠️ 자동 감지된 닉네임 변경입니다. 맞나요?
                    </p>
                    <button
                      onClick={() => handleConfirm(event.id, true)}
                      disabled={confirmingId === event.id}
                      className="px-3 py-1.5 text-xs bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors"
                    >
                      ✅ 맞아요 (닉변)
                    </button>
                    <button
                      onClick={() => handleConfirm(event.id, false)}
                      disabled={confirmingId === event.id}
                      className="px-3 py-1.5 text-xs bg-red-800 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      ❌ 아니에요 (탈퇴)
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
