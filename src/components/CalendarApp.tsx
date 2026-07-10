"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, Settings, Share2, Loader2, LogOut, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getContrastYIQ } from '@/lib/colorUtils';
import SettingsModal, { TabType } from './SettingsModal';
import { supabase } from '@/lib/supabase';

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
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-7 auto-rows-max">
            {calendarDays.map((day, i) => {
              const dateStr = day.format('YYYY-MM-DD');
              const isSelected = selectedDate === dateStr;
              const isCurrentMonth = day.month() === currentMonth.month();
              const eventData = events[dateStr];
              const activeColor = colorOptions.find(c => c.value === eventData?.bg_color);
              const isTransparent = !eventData?.bg_color || eventData.bg_color === 'transparent';
              const cellTextColorClass = !isTransparent ? getContrastYIQ(eventData.bg_color) : '';
              const isDarkBg = cellTextColorClass === 'text-white';
              
              return (
                <div
                  key={dateStr}
                  onClick={() => handleDateSelect(dateStr)}
                  className={cn(
                    "min-h-[80px] p-1 border-b border-r border-gray-100 cursor-pointer transition-colors relative flex flex-col",
                    !isCurrentMonth && "opacity-40",
                    isSelected ? "ring-2 ring-inset ring-blue-500 z-10" : "hover:bg-gray-50",
                    isDarkBg && "border-white/20"
                  )}
                  style={{ backgroundColor: !isTransparent ? eventData.bg_color : undefined }}
                >
                  <div className="flex justify-between items-start w-full">
                    <div className={cn(
                      "text-xs font-semibold p-1", 
                      isDarkBg ? "text-white" : (day.day() === 0 ? "text-red-500" : day.day() === 6 ? "text-blue-500" : "text-gray-700")
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
      </div>

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
          <div className="text-base sm:text-lg font-bold flex items-center justify-center">
            {dayjs(selectedDate).format('YYYY/MM/DD')}
            <span className="ml-1 sm:ml-2 text-xs sm:text-sm font-normal text-gray-500">
              ({['日', '月', '火', '水', '木', '金', '土'][dayjs(selectedDate).day()]})
            </span>
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

    </div>
  );
}