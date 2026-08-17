"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Settings, Share2, Loader2, LogOut, ChevronDown, ChevronUp, X, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getContrastYIQ } from '@/lib/colorUtils';
import { getHolidayName, getHolidaysForYears } from '@/lib/holidays';
import SettingsModal, { TabType } from './SettingsModal';
import HelpModal from './HelpModal';
import { supabase } from '@/lib/supabase';

// 長押しで複数選択モードに入るまでの時間 (ms)
const LONG_PRESS_MS = 500;
// スワイプとみなす最小移動距離 (px)
const SWIPE_THRESHOLD_PX = 60;
// 長押しをキャンセルする移動距離 (px)
const MOVE_CANCEL_PX = 10;

// --- Types ---
type EventData = { content: string; bg_color: string };

interface CalendarAppProps {
  loggedInCalendarId?: string;
  calendarId?: string;
  viewToken: string;
  isReadOnly?: boolean;
  onLogout?: () => void;
  onSwitchView?: (target: { id: string, token: string } | null) => void;
}

// URLをリンクに変換するコンポーネント
function LinkifyText({ text }: { text: string }) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return (
    <div className="flex-1 w-full p-3 border border-gray-100 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap break-words overflow-y-auto">
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          return (
            <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

export default function CalendarApp({ loggedInCalendarId, calendarId, viewToken, isReadOnly = false, onLogout, onSwitchView }: CalendarAppProps) {
  const truncateId = (id: string | undefined, maxLength: number) => {
    if (!id) return '';
    if (id.length <= maxLength) return id;
    return id.substring(0, maxLength) + '...';
  };
  const [currentMonth, setCurrentMonth] = useState(dayjs().startOf('month'));
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [events, setEvents] = useState<Record<string, EventData>>({});
  const today = dayjs().format('YYYY-MM-DD');

  // Multi-select State (長押しで開始し、タップで追加/解除する複数選択モード)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressFiredRef = useRef(false);
  const movedRef = useRef(false);

  // Monthly Memo State
  const [monthlyMemos, setMonthlyMemos] = useState<Record<string, string>>({});
  const [memoCollapsed, setMemoCollapsed] = useState(false);
  const memoSaveTimer = useRef<NodeJS.Timeout | null>(null);

  // Settings State
  const [themeColor, setThemeColor] = useState('#3b82f6');
  const [templates, setTemplates] = useState<{ id: string; name: string; content: string }[]>([]);
  const [colorOptions, setColorOptions] = useState<{ id: string; label: string; value: string }[]>([]);
  const [savedCalendars, setSavedCalendars] = useState<{ calendar_id: string; view_token: string }[]>([]);
  
  // App State
  const [actualCalendarId, setActualCalendarId] = useState<string>(calendarId || '');
  const [errorMsg, setErrorMsg] = useState('');
  
  // App State
  const [loadingData, setLoadingData] = useState(true);
  
  // Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<TabType>('calendar');
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  // Load Initial Data from Supabase
  useEffect(() => {
    const loadData = async () => {
      setLoadingData(true);
      setErrorMsg('');
      try {
        let targetId = calendarId;

        // 閲覧専用モードの場合、viewTokenからカレンダーIDを取得する
        if (isReadOnly && !targetId) {
          const { data: calData, error: calError } = await supabase
            .from('calendars')
            .select('calendar_id, theme_color, custom_colors')
            .eq('view_token', viewToken)
            .single();

          if (calError || !calData) {
            setErrorMsg('カレンダーが見つからないか、URLが無効です。');
            return;
          }

          targetId = calData.calendar_id;
          if (targetId) setActualCalendarId(targetId);
          if (calData.theme_color) setThemeColor(calData.theme_color);
          if (calData.custom_colors) setColorOptions(calData.custom_colors as any);
        } else if (targetId) {
          setActualCalendarId(targetId);
          // 1. Load Calendar Settings
          const { data: calData, error: calError } = await supabase
            .from('calendars')
            .select('theme_color, custom_colors, saved_calendars')
            .eq('calendar_id', targetId)
            .single();

          if (calError || !calData) {
            let msg = 'このカレンダーは削除されたか、存在しません。';
            
            // もし他人のカレンダーを閲覧しようとして削除されていた場合は、フォローリストから自動解除する
            if (loggedInCalendarId && loggedInCalendarId !== targetId) {
              const { data: meData } = await supabase
                .from('calendars')
                .select('saved_calendars')
                .eq('calendar_id', loggedInCalendarId)
                .single();
                
              if (meData?.saved_calendars) {
                const filtered = meData.saved_calendars.filter((c: any) => c.calendar_id !== targetId);
                await supabase.from('calendars').update({ saved_calendars: filtered }).eq('calendar_id', loggedInCalendarId);
                setSavedCalendars(filtered);
                msg = '対象のカレンダーは削除されていました。フォローリストから自動的に解除しました。';
              }
            }
            setErrorMsg(msg);
            return;
          }

          if (calData) {
            if (calData.theme_color) setThemeColor(calData.theme_color);
            if (calData.custom_colors) setColorOptions(calData.custom_colors as any);
            if (calData.saved_calendars) setSavedCalendars(calData.saved_calendars as any);
          }
        }

        // loggedInCalendarId がある場合、他人のカレンダー閲覧中であっても自分のフォローリストを読み込む
        if (loggedInCalendarId && loggedInCalendarId !== targetId) {
          const { data: meData } = await supabase
            .from('calendars')
            .select('saved_calendars')
            .eq('calendar_id', loggedInCalendarId)
            .single();
            
          if (meData?.saved_calendars) {
            setSavedCalendars(meData.saved_calendars as any);
          }
        }

        if (!targetId) return;

        // Reset events to ensure no stale data
        setEvents({});

        // 2. Load Templates
        const { data: tmplData } = await supabase
          .from('templates')
          .select('template_id, name, content')
          .eq('calendar_id', targetId)
          .order('created_at', { ascending: true });

        if (tmplData) {
          setTemplates(tmplData.map(t => ({ id: t.template_id, name: t.name, content: t.content })));
        }

        // 3. Load Events
        const { data: evtData } = await supabase
          .from('events')
          .select('target_date, content, bg_color')
          .eq('calendar_id', targetId);

        if (evtData) {
          const eventsMap: Record<string, EventData> = {};
          evtData.forEach(evt => {
            eventsMap[evt.target_date] = { content: evt.content || '', bg_color: evt.bg_color || 'transparent' };
          });
          setEvents(eventsMap);
        }

        // 4. Load Monthly Memos
        const { data: memoData } = await supabase
          .from('monthly_memos')
          .select('year_month, content')
          .eq('calendar_id', targetId);

        if (memoData) {
          const memoMap: Record<string, string> = {};
          memoData.forEach(m => {
            memoMap[m.year_month] = m.content || '';
          });
          setMonthlyMemos(memoMap);
        } else {
          setMonthlyMemos({});
        }
      } catch (err) {
        console.error("Failed to load data", err);
        setErrorMsg('データの読み込みに失敗しました。');
      } finally {
        setLoadingData(false);
      }
    };
    loadData();
  }, [calendarId, viewToken, isReadOnly]);

  // Derive calendar days
  const calendarDays = useMemo(() => {
    const start = currentMonth.startOf('month').startOf('week');
    const end = currentMonth.endOf('month').endOf('week');
    const days = [];
    let curr = start;
    while (curr.isBefore(end) || curr.isSame(end, 'day')) {
      days.push(curr);
      curr = curr.add(1, 'day');
    }
    return days;
  }, [currentMonth]);

  // 日本の祝日（表示中の月をまたぐ年をすべてカバー）
  const holidays = useMemo(() => {
    const years = Array.from(new Set(calendarDays.map(d => d.year())));
    return getHolidaysForYears(years);
  }, [calendarDays]);

  const currentYearMonth = currentMonth.format('YYYY-MM');
  const currentMemo = monthlyMemos[currentYearMonth] || '';

  // Handlers
  const handlePrevMonth = () => setCurrentMonth(currentMonth.subtract(1, 'month'));
  const handleNextMonth = () => setCurrentMonth(currentMonth.add(1, 'month'));

  const handleDateSelect = (dateStr: string) => {
    setSelectedDate(dateStr);
    setIsDetailOpen(true);
  };

  const handlePrevDay = () => {
    setSelectedDate(dayjs(selectedDate).subtract(1, 'day').format('YYYY-MM-DD'));
  };
  const handleNextDay = () => {
    setSelectedDate(dayjs(selectedDate).add(1, 'day').format('YYYY-MM-DD'));
  };

  const currentEvent = events[selectedDate] || { content: '', bg_color: 'transparent' };

  // Save event to DB
  const saveEventToDB = async (dateStr: string, content: string, bgColor: string) => {
    if (isReadOnly || !actualCalendarId || actualCalendarId !== loggedInCalendarId) return;

    if (!content && bgColor === 'transparent') {
      await supabase.from('events').upsert({
        calendar_id: actualCalendarId,
        target_date: dateStr,
        content: '',
        bg_color: 'transparent',
        updated_at: new Date().toISOString()
      }, { onConflict: 'calendar_id,target_date' });
      return;
    }
    
    await supabase.from('events').upsert({
      calendar_id: actualCalendarId,
      target_date: dateStr,
      content,
      bg_color: bgColor,
      updated_at: new Date().toISOString()
    }, { onConflict: 'calendar_id,target_date' });
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setEvents((prev) => ({
      ...prev,
      [selectedDate]: { ...currentEvent, content: newContent },
    }));

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveEventToDB(selectedDate, newContent, currentEvent.bg_color);
    }, 500); // Debounce DB save
  };

  const handleColorChange = (color: string) => {
    setEvents((prev) => ({
      ...prev,
      [selectedDate]: { ...currentEvent, bg_color: color },
    }));
    saveEventToDB(selectedDate, currentEvent.content, color);
  };

  // --- Multi-select (長押しで選択モード開始) ---
  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const toggleDateSelection = (dateStr: string) => {
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(dateStr)) {
        next.delete(dateStr);
      } else {
        next.add(dateStr);
      }
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  };

  const handleCellPointerDown = (e: React.PointerEvent, dateStr: string) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    longPressFiredRef.current = false;
    clearLongPressTimer();
    if (isReadOnly) return; // 閲覧専用モードでは長押し選択を開始しない
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      setSelectionMode(true);
      setSelectedDates(prev => new Set(prev).add(dateStr));
      if (navigator.vibrate) navigator.vibrate(15);
    }, LONG_PRESS_MS);
  };

  const handleCellPointerMove = (e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;
    const dx = Math.abs(e.clientX - pointerStartRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartRef.current.y);
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
      movedRef.current = true;
      clearLongPressTimer();
    }
  };

  // タップ判定・選択トグル・日付詳細表示は全てpointerイベント内で完結させる
  // (ブラウザのクリック合成イベントの挙動差に依存させないため)
  const handleCellPointerUp = (dateStr: string) => {
    clearLongPressTimer();
    pointerStartRef.current = null;
    const wasLongPress = longPressFiredRef.current;
    const moved = movedRef.current;
    longPressFiredRef.current = false;
    movedRef.current = false;

    if (wasLongPress || moved) return;

    if (!isReadOnly && selectionMode) {
      toggleDateSelection(dateStr);
    } else {
      handleDateSelect(dateStr);
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedDates(new Set());
  };

  const applyColorToSelection = async (color: string) => {
    const dates = Array.from(selectedDates);
    setEvents(prev => {
      const next = { ...prev };
      dates.forEach(d => {
        next[d] = { content: next[d]?.content || '', bg_color: color };
      });
      return next;
    });
    await Promise.all(dates.map(d => saveEventToDB(d, events[d]?.content || '', color)));
    exitSelectionMode();
  };

  // --- スワイプで月送り (モバイル・タッチのみ) ---
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleGridPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleGridPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || !swipeStartRef.current) return;
    const dx = e.clientX - swipeStartRef.current.x;
    const dy = e.clientY - swipeStartRef.current.y;
    swipeStartRef.current = null;

    // 選択モード中はスワイプでの月送りを無効化（複数選択の操作を優先）
    if (selectionMode) return;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) handlePrevMonth();
      else handleNextMonth();
    }
  };

  // --- 月間メモ ---
  const handleMemoChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const ym = currentYearMonth;
    setMonthlyMemos(prev => ({ ...prev, [ym]: value }));

    if (memoSaveTimer.current) clearTimeout(memoSaveTimer.current);
    memoSaveTimer.current = setTimeout(() => {
      saveMemoToDB(ym, value);
    }, 500);
  };

  const saveMemoToDB = async (yearMonth: string, content: string) => {
    if (isReadOnly || !actualCalendarId) return;
    await supabase.from('monthly_memos').upsert({
      calendar_id: actualCalendarId,
      year_month: yearMonth,
      content,
      updated_at: new Date().toISOString()
    }, { onConflict: 'calendar_id,year_month' });
  };

  const handleTemplateInsert = (templateContent: string) => {
    const textarea = document.getElementById('event-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = currentEvent.content;

    const newText = text.substring(0, start) + templateContent + text.substring(end);
    setEvents((prev) => ({
      ...prev,
      [selectedDate]: { ...currentEvent, content: newText },
    }));

    saveEventToDB(selectedDate, newText, currentEvent.bg_color);

    // Re-focus and set cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + templateContent.length, start + templateContent.length);
    }, 0);
  };

  const openSettings = (tab: TabType) => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  };

  const headerTextColorClass = getContrastYIQ(themeColor);

  const handleShare = () => {
    const url = `${window.location.origin}/?view=${viewToken}`;
    navigator.clipboard.writeText(url);
    alert('閲覧用URLをクリップボードにコピーしました！\n' + url);
  };

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 text-red-500 font-semibold gap-4 px-4 text-center">
        <p>{errorMsg}</p>
        <button 
          onClick={() => {
            if (onSwitchView) onSwitchView(null);
            else window.location.reload();
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
        >
          {loggedInCalendarId ? 'マイカレンダーに戻る' : 'リロード'}
        </button>
      </div>
    );
  }

  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      {/* ===== Global Header ===== */}
      <header 
        className={cn("h-14 flex items-center justify-between px-2 sm:px-4 shadow-sm z-20 shrink-0", headerTextColorClass)}
        style={{ backgroundColor: themeColor }}
      >
        <div className="flex items-center gap-2">
          <h1 className="font-bold text-lg flex items-center gap-2">
            <img 
              src="/icon.png" 
              alt="Logo" 
              className="w-6 h-6 object-contain" 
              style={{ filter: headerTextColorClass === 'text-white' ? 'brightness(0) invert(1)' : 'brightness(0)' }}
            />
          </h1>
          
          {loggedInCalendarId && onSwitchView ? (
            <div className="relative flex items-center">
              <select
                className={cn(
                  "appearance-none transition-colors rounded-lg py-1.5 pl-3 pr-8 font-bold text-lg outline-none cursor-pointer border border-transparent truncate max-w-[130px] sm:max-w-[250px]",
                  headerTextColorClass,
                  headerTextColorClass === 'text-white' 
                    ? "bg-white/10 hover:bg-white/20 focus:border-white/30" 
                    : "bg-black/5 hover:bg-black/10 focus:border-black/20"
                )}
                value={isReadOnly ? actualCalendarId : "mine"}
                onChange={(e) => {
                  if (e.target.value === "mine") {
                    onSwitchView(null);
                  } else {
                    const target = savedCalendars.find(c => c.calendar_id === e.target.value);
                    if (target) {
                      onSwitchView({ id: target.calendar_id, token: target.view_token });
                    }
                  }
                }}
              >
                <option value="mine" className="text-gray-900 bg-white">{truncateId(loggedInCalendarId, 12)}</option>
                {savedCalendars.map(c => (
                  <option key={c.view_token} value={c.calendar_id} className="text-gray-900 bg-white">
                    {truncateId(c.calendar_id, 12)}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 pointer-events-none opacity-70" size={18} />
            </div>
          ) : (
            <h1 className="font-bold text-lg truncate max-w-[150px] sm:max-w-[300px] md:max-w-none">
              <span className="hidden md:inline">しいたけカレンダー</span>
              <span className="inline md:hidden">カレンダー</span> {actualCalendarId ? truncateId(actualCalendarId, 10) : ''} {isReadOnly && <span className="ml-2 text-xs font-normal opacity-80">(閲覧)</span>}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsHelpOpen(true)}
            className={cn("p-2 rounded-full hover:bg-black/10 transition-colors", headerTextColorClass)}
            title="使い方・機能ガイド"
          >
            <HelpCircle size={20} />
          </button>
          {!isReadOnly && (
            <>
              <button
                onClick={handleShare}
                className={cn("p-2 rounded-full hover:bg-black/10 transition-colors flex items-center gap-1", headerTextColorClass)}
                title="閲覧用URLをコピー"
              >
                <Share2 size={18} />
              </button>
              <button
                onClick={() => openSettings('calendar')}
                className={cn("p-2 rounded-full hover:bg-black/10 transition-colors", headerTextColorClass)}
                title="設定"
              >
                <Settings size={20} />
              </button>
              {onLogout && (
                <button 
                  onClick={onLogout}
                  className={cn("p-2 rounded-full hover:bg-black/10 transition-colors", headerTextColorClass)}
                  title="ログアウト"
                >
                  <LogOut size={20} />
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {/* ===== Main Content Area ===== */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden relative">
        {/* ===== Left: Calendar Area ===== */}
        <div className={cn(
          "md:flex-[2] flex-col bg-white border-b md:border-b-0 md:border-r border-gray-200 overflow-hidden",
          isDetailOpen ? "flex-[1] flex" : "flex-1 flex"
        )}>
        
        {/* Calendar Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
          <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ChevronLeft size={20} />
          </button>
          
          <div className="relative flex items-center justify-center group px-4 py-1 rounded-md hover:bg-gray-100 transition-colors cursor-pointer">
            <h2 className="text-xl font-bold flex items-center gap-1">
              {currentMonth.format('YYYY年 M月')}
              <ChevronDown size={16} className="text-gray-400 group-hover:text-gray-600" />
            </h2>
            <input
              type="month"
              className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
              value={currentMonth.format('YYYY-MM')}
              onClick={(e) => {
                try {
                  if ('showPicker' in e.currentTarget) {
                    (e.currentTarget as HTMLInputElement).showPicker();
                  }
                } catch (err) {}
              }}
              onChange={(e) => {
                if (e.target.value) {
                  setCurrentMonth(dayjs(e.target.value).startOf('month'));
                }
              }}
            />
          </div>

          <button onClick={handleNextMonth} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Days of Week */}
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
          {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
            <div key={d} className={cn("text-center py-2 text-sm font-medium", i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500")}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div
          className="flex-1 overflow-y-auto"
          onPointerDown={handleGridPointerDown}
          onPointerUp={handleGridPointerUp}
          onPointerCancel={handleGridPointerUp}
        >
          <div className="grid grid-cols-7 auto-rows-max">
            {calendarDays.map((day, i) => {
              const dateStr = day.format('YYYY-MM-DD');
              const isSelected = selectedDate === dateStr;
              const isCurrentMonth = day.month() === currentMonth.month();
              const isToday = dateStr === today;
              const isMultiSelected = selectedDates.has(dateStr);
              const holidayName = holidays[dateStr];
              const eventData = events[dateStr];
              const activeColor = colorOptions.find(c => c.value === eventData?.bg_color);
              const isTransparent = !eventData?.bg_color || eventData.bg_color === 'transparent';
              const cellTextColorClass = !isTransparent ? getContrastYIQ(eventData.bg_color) : '';
              const isDarkBg = cellTextColorClass === 'text-white';
              const isDateRed = !isDarkBg && (day.day() === 0 || !!holidayName);

              return (
                <div
                  key={dateStr}
                  onPointerDown={(e) => handleCellPointerDown(e, dateStr)}
                  onPointerMove={handleCellPointerMove}
                  onPointerUp={() => handleCellPointerUp(dateStr)}
                  onPointerCancel={() => handleCellPointerUp(dateStr)}
                  className={cn(
                    "min-h-[80px] p-1 border-b border-r border-gray-100 cursor-pointer transition-colors relative flex flex-col select-none",
                    !isCurrentMonth && "opacity-40",
                    isSelected ? "ring-2 ring-inset ring-blue-500 z-10" : "hover:bg-gray-50",
                    isMultiSelected && "ring-2 ring-inset ring-indigo-500 bg-indigo-50 z-10",
                    isDarkBg && "border-white/20"
                  )}
                  style={{ backgroundColor: !isTransparent ? eventData.bg_color : undefined }}
                >
                  {isToday && (
                    <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-blue-500" />
                  )}
                  {isMultiSelected && (
                    <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-bold z-20">
                      ✓
                    </div>
                  )}
                  <div className="flex justify-between items-start w-full">
                    <div className={cn(
                      "text-xs font-semibold p-1 rounded-full flex items-center justify-center",
                      isToday && (isDarkBg ? "bg-white/25" : "bg-blue-500 text-white"),
                      !isToday && (isDarkBg ? "text-white" : isDateRed ? "text-red-500" : day.day() === 6 ? "text-blue-500" : "text-gray-700")
                    )}>
                      {day.format('D')}
                    </div>
                    {activeColor && !isTransparent && (
                      <div className={cn(
                        "text-[9px] px-1.5 py-0.5 mt-1 mr-1 rounded font-medium shrink-0",
                        isDarkBg ? "bg-white/20 text-white" : "bg-black/10 text-gray-800"
                      )}>
                        {activeColor.label}
                      </div>
                    )}
                  </div>
                  {holidayName && (
                    <div className={cn(
                      "text-[9px] leading-tight truncate px-1",
                      isDarkBg ? "text-white/90" : "text-red-500"
                    )}>
                      {holidayName}
                    </div>
                  )}
                  {eventData?.content && (
                    <div className={cn(
                      "text-[10px] sm:text-xs leading-tight whitespace-pre-wrap break-words px-1 pb-1 mt-1",
                      isDarkBg ? "text-white/95" : "text-gray-800"
                    )}>
                      {eventData.content}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Monthly Memo (カレンダー下部) */}
        <div className="border-t border-gray-200 bg-gray-50 shrink-0">
          <button
            onClick={() => setMemoCollapsed(!memoCollapsed)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <span>月間メモ（{currentMonth.format('YYYY年M月')}）</span>
            {memoCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {!memoCollapsed && (
            <div className="px-4 pb-3">
              {isReadOnly ? (
                currentMemo ? (
                  <div className="text-xs text-gray-700 whitespace-pre-wrap break-words bg-white border border-gray-200 rounded-lg p-2 max-h-24 overflow-y-auto">
                    {currentMemo}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">メモはありません</div>
                )
              ) : (
                <textarea
                  value={currentMemo}
                  onChange={handleMemoChange}
                  placeholder="この月のメモを入力... (自動保存)"
                  className="w-full text-xs sm:text-sm p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-16 sm:h-20 bg-white"
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== 複数選択ツールバー ===== */}
      {selectionMode && (
        <div className="fixed bottom-14 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-[0_-4px_15px_rgba(0,0,0,0.1)] px-4 py-3 flex items-center gap-3 flex-wrap md:left-auto md:right-4 md:bottom-4 md:rounded-xl md:border md:max-w-md">
          <span className="text-xs sm:text-sm font-medium text-gray-700 shrink-0">{selectedDates.size}件選択中</span>
          <div className="flex items-center gap-2 flex-wrap flex-1">
            {colorOptions.map(c => (
              <button
                key={c.id}
                onClick={() => applyColorToSelection(c.value)}
                className="w-7 h-7 rounded-full border-2 border-gray-200 hover:scale-110 transition-transform shrink-0"
                style={{ backgroundColor: c.value === 'transparent' ? '#fff' : c.value }}
                title={c.label}
              >
                {c.value === 'transparent' && (
                  <div className="w-full h-full rounded-full border-2 border-dashed border-gray-300" />
                )}
              </button>
            ))}
          </div>
          <button
            onClick={exitSelectionMode}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 shrink-0"
            title="選択解除"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* ===== Right: Detail Panel ===== */}
      <div className={cn(
        "md:flex-[1] flex-col bg-white overflow-hidden shadow-[0_-4px_15px_rgba(0,0,0,0.05)] md:shadow-none z-10 md:z-auto border-t border-gray-200 md:border-t-0",
        isDetailOpen ? "flex flex-[1.2] md:flex" : "hidden md:flex"
      )}>
        
        {/* Detail Header / Nav */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 bg-gray-50 shrink-0">
          <div className="flex items-center">
            <button onClick={() => setIsDetailOpen(false)} className="md:hidden mr-1 p-1.5 text-gray-500 hover:bg-gray-200 rounded-full transition-colors" title="閉じる">
              <ChevronDown size={20} />
            </button>
            <button onClick={handlePrevDay} className="flex items-center px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-md transition-colors">
              <ChevronLeft size={16} className="mr-1 hidden sm:block" />
              <span className="sm:hidden">&lt; 前日</span>
              <span className="hidden sm:inline">前日</span>
            </button>
          </div>
          <div className="text-base sm:text-lg font-bold flex items-center justify-center flex-wrap gap-x-2 text-center">
            <span className="flex items-center">
              {dayjs(selectedDate).format('YYYY/MM/DD')}
              <span className={cn(
                "ml-1 sm:ml-2 text-xs sm:text-sm font-normal",
                dayjs(selectedDate).day() === 0 || getHolidayName(selectedDate) ? "text-red-500" : dayjs(selectedDate).day() === 6 ? "text-blue-500" : "text-gray-500"
              )}>
                ({['日', '月', '火', '水', '木', '金', '土'][dayjs(selectedDate).day()]})
              </span>
            </span>
            {getHolidayName(selectedDate) && (
              <span className="text-[10px] sm:text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                {getHolidayName(selectedDate)}
              </span>
            )}
          </div>
          <button onClick={handleNextDay} className="flex items-center px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-md transition-colors">
            <span className="sm:hidden">翌日 &gt;</span>
            <span className="hidden sm:inline">翌日</span>
            <ChevronRight size={16} className="ml-1 hidden sm:block" />
          </button>
        </div>

        {/* Detail Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          
          {/* Templates (Hide in read-only) */}
          {!isReadOnly && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-gray-500">テンプレート挿入</div>
                <button 
                  onClick={() => openSettings('template')}
                  className="text-xs text-blue-600 hover:underline"
                >
                  編集
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleTemplateInsert(t.content)}
                    className="px-3 py-1.5 text-xs font-medium bg-gray-50 text-gray-700 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Color Picker (Hide in read-only) */}
          {!isReadOnly && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-gray-500">背景色</div>
                <button 
                  onClick={() => openSettings('color')}
                  className="text-xs text-blue-600 hover:underline"
                >
                  編集
                </button>
              </div>
              <div className="flex gap-2 flex-wrap">
                {colorOptions.map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleColorChange(c.value)}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 transition-all",
                      currentEvent.bg_color === c.value || (currentEvent.bg_color === 'transparent' && c.value === 'transparent') 
                        ? "border-gray-800 scale-110" 
                        : "border-gray-200 hover:scale-105"
                    )}
                    style={{ backgroundColor: c.value === 'transparent' ? '#fff' : c.value }}
                    title={c.label}
                  >
                    {c.value === 'transparent' && (
                      <div className="w-full h-full rounded-full border-2 border-dashed border-gray-300" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Textarea or Read-Only display */}
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-gray-500">予定詳細</div>
              {(() => {
                const activeColor = colorOptions.find(c => c.value === currentEvent.bg_color);
                if (activeColor && activeColor.value !== 'transparent') {
                  return (
                    <div className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium border border-gray-200">
                      カテゴリ: {activeColor.label}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            {isReadOnly ? (
              <LinkifyText text={currentEvent.content} />
            ) : (
              <textarea
                id="event-textarea"
                className="flex-1 w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="予定を入力... (自動保存)"
                value={currentEvent.content}
                onChange={handleContentChange}
              />
            )}
          </div>
          
        </div>
      </div>
      </div>

      {/* ===== Global Footer (Hide in read-only) ===== */}
      {!isReadOnly && actualCalendarId === loggedInCalendarId && (
        <footer className="h-14 bg-white border-t border-gray-200 flex items-center justify-around px-4 shrink-0 shadow-[0_-1px_3px_rgba(0,0,0,0.05)] z-20">
          <button 
            onClick={() => openSettings('calendar')}
            className="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-blue-600 transition-colors"
          >
            <Settings size={18} />
            <span className="text-[10px] mt-1 font-medium">カレンダー設定</span>
          </button>
          <button 
            onClick={() => openSettings('template')}
            className="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-blue-600 transition-colors border-x border-gray-100"
          >
            <Settings size={18} />
            <span className="text-[10px] mt-1 font-medium">テンプレート設定</span>
          </button>
          <button 
            onClick={() => openSettings('color')}
            className="flex flex-col items-center justify-center w-full h-full text-gray-500 hover:text-blue-600 transition-colors"
          >
            <Settings size={18} />
            <span className="text-[10px] mt-1 font-medium">背景カラー設定</span>
          </button>
        </footer>
      )}

      {/* ===== Settings Modal ===== */}
      {!isReadOnly && actualCalendarId === loggedInCalendarId && (
        <SettingsModal 
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          activeTab={settingsTab}
          calendarId={actualCalendarId}
          themeColor={themeColor}
          setThemeColor={setThemeColor}
          templates={templates}
          setTemplates={setTemplates}
          colorOptions={colorOptions}
          setColorOptions={setColorOptions}
          savedCalendars={savedCalendars}
          setSavedCalendars={setSavedCalendars}
          onAccountDeleted={() => {
            setIsSettingsOpen(false);
            if (onLogout) onLogout();
          }}
        />
      )}

      {/* ===== Help Modal ===== */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} isReadOnly={isReadOnly} />

    </div>
  );
}