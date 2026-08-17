-- 月間メモ機能用のテーブル
-- Supabaseのダッシュボード（SQL Editor）で実行してください。

create table if not exists monthly_memos (
  calendar_id text not null references calendars(calendar_id) on delete cascade,
  year_month text not null, -- 'YYYY-MM' 形式
  content text not null default '',
  updated_at timestamptz not null default now(),
  primary key (calendar_id, year_month)
);

alter table monthly_memos enable row level security;

-- events / templates と同様にanonキーからの読み書きを許可するポリシー。
-- 既存テーブルのポリシーがこれと異なる場合は合わせて調整してください。
drop policy if exists "Allow all access to monthly_memos" on monthly_memos;
create policy "Allow all access to monthly_memos"
  on monthly_memos
  for all
  using (true)
  with check (true);
