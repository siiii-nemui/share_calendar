import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';

interface LoginProps {
  onLogin: (calendarId: string, viewToken: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [calendarId, setCalendarId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calendarId || !password) {
      setError('IDとパスワードを入力してください。');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. カレンダーIDが存在するか確認
      const { data: existingCal, error: fetchError } = await supabase
        .from('calendars')
        .select('*')
        .eq('calendar_id', calendarId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (existingCal) {
        // 2. 存在する場合はパスワードチェック (bcrypt)
        const isMatch = await bcrypt.compare(password, existingCal.password_hash);
        if (isMatch) {
          onLogin(existingCal.calendar_id, existingCal.view_token);
        } else {
          setError('パスワードが間違っています。');
        }
      } else {
        // 3. 存在しない場合は新規作成
        const viewToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const { data: newCal, error: insertError } = await supabase
          .from('calendars')
          .insert([
            {
              calendar_id: calendarId,
              password_hash: hashedPassword,
              view_token: viewToken,
            }
          ])
          .select()
          .single();

        if (insertError) throw insertError;
        if (newCal) {
          onLogin(newCal.calendar_id, newCal.view_token);
        }
      }
    } catch (err: any) {
      console.error("Login Error Details:", {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        name: err?.name,
        full: err
      });
      // 詳細なエラーメッセージを表示
      const msg = err?.message || err?.details || err?.code || JSON.stringify(err);
      setError(`エラー: ${msg} (詳細: ${err?.name})`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-50 px-4">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-sm">
        <div className="text-center mb-8 flex flex-col items-center">
          <img src="/icon.png" alt="Logo" className="w-16 h-16 mb-2 object-contain" />
          <h1 className="text-2xl font-bold text-gray-800">しいたけカレンダー</h1>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">カレンダーID</label>
            <input
              type="text"
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              className="w-full p-2 text-sm text-gray-900 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 bg-white"
              placeholder=""
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 text-sm text-gray-900 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 bg-white"
              placeholder="新規の場合はそのまま登録されます"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors disabled:opacity-50"
          >
            {loading ? '処理中...' : 'ログイン / 新規作成'}
          </button>
        </form>
      </div>
    </div>
  );
}