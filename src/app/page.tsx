"use client";

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import CalendarApp from '@/components/CalendarApp';
import Login from '@/components/Login';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const searchParams = useSearchParams();
  const viewTokenQuery = searchParams.get('view');

  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [viewToken, setViewToken] = useState<string | null>(null);

  const [viewingOther, setViewingOther] = useState<{ id: string, token: string } | null>(null);

  // 閲覧専用モード (URL共有で直接アクセスした場合)
  if (viewTokenQuery) {
    return (
      <main>
        <CalendarApp viewToken={viewTokenQuery} isReadOnly={true} />
      </main>
    );
  }

  // 編集モード（未ログイン）
  if (!calendarId || !viewToken) {
    return <Login onLogin={(id, token) => {
      setCalendarId(id);
      setViewToken(token);
    }} />;
  }

  // 編集モード（ログイン済み）
  return (
    <main>
      <CalendarApp 
        loggedInCalendarId={calendarId}
        calendarId={viewingOther ? viewingOther.id : calendarId} 
        viewToken={viewingOther ? viewingOther.token : viewToken} 
        isReadOnly={!!viewingOther} 
        onLogout={() => {
          setCalendarId(null);
          setViewToken(null);
          setViewingOther(null);
        }}
        onSwitchView={(target) => setViewingOther(target)}
      />
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    }>
      <AppContent />
    </Suspense>
  );
}