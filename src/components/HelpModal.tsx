import React from 'react';
import { X } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  isReadOnly?: boolean;
}

const NEW_FEATURES = [
  { title: '祝日の自動表示', desc: '日本の祝日（振替休日・国民の休日を含む）を自動計算してカレンダーに表示します。' },
  { title: '当日のハイライト', desc: '今日の日付は青いドットと丸背景で強調表示されます。' },
  { title: '複数日選択で背景色を一括変更', desc: '日付を長押しすると複数選択モードになります。続けてタップで日付を追加/解除でき、画面下部のツールバーから背景色をまとめて変更できます。' },
  { title: 'スマホでのスワイプ月送り', desc: 'カレンダー部分を左右にスワイプすると前後の月に移動できます（複数選択モード中は無効です）。' },
  { title: '月間メモ', desc: 'カレンダー下部の「月間メモ」欄に、表示中の月ごとの自由なメモを書き込めます（自動保存）。' },
];

const EXISTING_FEATURES = [
  { title: '日付を選択', desc: '日付をタップすると詳細パネルが開き、その日の予定を確認・編集できます。' },
  { title: 'テンプレート挿入', desc: 'よく使う文章をテンプレートとして登録し、ワンタップで予定欄に挿入できます。' },
  { title: '背景色でカテゴリ分け', desc: '日付ごとに背景色を設定して、予定の種類を色分けできます。' },
  { title: '閲覧用URLの共有', desc: 'ヘッダーの共有ボタンから、閲覧専用URLをコピーして他の人に共有できます。' },
  { title: '他カレンダーのフォロー', desc: '設定からフォローを登録すると、ヘッダーのメニューから他人のカレンダーに切り替えて閲覧できます。' },
  { title: '各種設定', desc: 'カレンダーのテーマ色・パスワード・テンプレート・背景色・フォロー先を設定画面から管理できます。' },
];

export default function HelpModal({ isOpen, onClose, isReadOnly = false }: HelpModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
          <h2 className="text-lg font-bold text-gray-800">使い方・機能ガイド</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-blue-600 mb-3">新機能</h3>
            <ul className="space-y-3">
              {NEW_FEATURES.map(f => (
                <li key={f.title}>
                  <div className="text-sm font-medium text-gray-800">{f.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{f.desc}</div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-500 mb-3">既存機能</h3>
            <ul className="space-y-3">
              {EXISTING_FEATURES.map(f => (
                <li key={f.title}>
                  <div className="text-sm font-medium text-gray-800">{f.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{f.desc}</div>
                </li>
              ))}
            </ul>
          </section>

          {isReadOnly && (
            <p className="text-xs text-gray-400 border-t border-gray-100 pt-4">
              ※ 現在は閲覧専用モードのため、編集系の機能は利用できません。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
