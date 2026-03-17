import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '길드 전투력 트래커 | 바부들',
  description: '메이플키우기 길드원 전투력 성장 추적 대시보드',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <nav className="border-b border-gray-800 bg-gray-900 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚔️</span>
              <div>
                <h1 className="font-bold text-lg text-white leading-none">바부들 길드</h1>
                <p className="text-xs text-gray-400">전투력 트래커</p>
              </div>
            </div>
            <nav className="flex gap-6 text-sm">
              <a href="/" className="text-gray-300 hover:text-white transition-colors">대시보드</a>
              <a href="/events" className="text-gray-300 hover:text-white transition-colors">이벤트 로그</a>
            </nav>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
