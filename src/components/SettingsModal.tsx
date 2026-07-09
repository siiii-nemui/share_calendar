import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';

export type TabType = 'calendar' | 'template' | 'color' | 'follow';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: TabType;
  calendarId: string;
  themeColor: string;
  setThemeColor: (color: string) => void;
  templates: { id: string; name: string; content: string }[];
  setTemplates: (templates: { id: string; name: string; content: string }[]) => void;
  colorOptions: { id: string; label: string; value: string }[];
  setColorOptions: (colors: { id: string; label: string; value: string }[]) => void;
  savedCalendars?: { calendar_id: string; view_token: string }[];
  setSavedCalendars?: (c: { calendar_id: string; view_token: string }[]) => void;
  onAccountDeleted?: () => void;
}

export default function SettingsModal({
  isOpen, onClose, activeTab: initialTab,
  calendarId,
  themeColor, setThemeColor,
  templates, setTemplates,
  colorOptions, setColorOptions,
  savedCalendars = [], setSavedCalendars,
  onAccountDeleted
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  
  // Temporary state for Calendar Settings
  const [tempId, setTempId] = useState(calendarId);
  const [tempPassword, setTempPassword] = useState('');
  const [followInput, setFollowInput] = useState('');
  
  const [localThemeColor, setLocalThemeColor] = useState(themeColor);
  const [localTemplates, setLocalTemplates] = useState([...templates]);
  const [localColorOptions, setLocalColorOptions] = useState([...colorOptions]);
  const [localSavedCalendars, setLocalSavedCalendars] = useState([...savedCalendars]);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Sync props to local state when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setTempId(calendarId);
      setTempPassword('');
      setFollowInput('');
      setLocalThemeColor(themeColor);
      setLocalTemplates([...templates]);
      setLocalColorOptions([...colorOptions]);
      setLocalSavedCalendars([...savedCalendars]);
      setMessage('');
    }
  }, [isOpen, initialTab, calendarId, themeColor, templates, colorOptions, savedCalendars]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      if (activeTab === 'calendar') {
        const updates: any = { theme_color: localThemeColor };
        
        // Password update
        if (tempPassword) {
          const salt = await bcrypt.genSalt(10);
          updates.password_hash = await bcrypt.hash(tempPassword, salt);
        }
        
        // ID change (Note: changing PK requires cascading or careful handling. 
        // For now, let's restrict ID change to keep it simple, or implement it if critical.
        // Actually, Supabase text PK with cascade might allow update, but let's just update other fields.)
        if (tempId !== calendarId) {
          // Updating PK is tricky in Supabase without functions. Let's warn user.
          setMessage('エラー: IDの変更は現在サポートされていません。');
          setSaving(false);
          return;
        }

        const { error } = await supabase.from('calendars').update(updates).eq('calendar_id', calendarId);
        if (error) throw error;
        
        setThemeColor(localThemeColor);
        setMessage('カレンダー設定を保存しました。');
      } 
      else if (activeTab === 'template') {
        // Simple sync: delete all and insert new. (Not ideal for large sets, but fine for a few templates)
        await supabase.from('templates').delete().eq('calendar_id', calendarId);
        
        const inserts = localTemplates.map(t => ({
          calendar_id: calendarId,
          name: t.name,
          content: t.content
        }));
        
        if (inserts.length > 0) {
          await supabase.from('templates').insert(inserts);
        }
        
        // Refresh templates state from DB or just use local
        // Here we just use local but assign proper IDs if possible, or just re-fetch later
        setTemplates(localTemplates);
        setMessage('テンプレート設定を保存しました。');
      }
      else if (activeTab === 'color') {
        const { error } = await supabase.from('calendars').update({ custom_colors: localColorOptions }).eq('calendar_id', calendarId);
        if (error) throw error;
        
        setColorOptions(localColorOptions);
        setMessage('背景カラー設定を保存しました。');
      }
      else if (activeTab === 'follow') {
        const { error } = await supabase.from('calendars').update({ saved_calendars: localSavedCalendars }).eq('calendar_id', calendarId);
        if (error) throw error;
        
        if (setSavedCalendars) setSavedCalendars(localSavedCalendars);
        setMessage('フォロー設定を保存しました。');
      }
      
      // Auto clear message
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      console.error("Save Error Details:", {
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        name: err?.name,
        full: err
      });
      setMessage(`エラー: ${err?.message || err?.details || JSON.stringify(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAddFollow = async () => {
    if (!followInput.trim()) return;
    
    // extract token from ?view=... or just use raw token
    let token = followInput.trim();
    const match = token.match(/[?&]view=([^&]+)/);
    if (match) {
      token = match[1];
    }
    
    setSaving(true);
    setMessage('');
    try {
      const { data, error } = await supabase
        .from('calendars')
        .select('calendar_id, view_token')
        .eq('view_token', token)
        .single();
        
      if (error || !data) {
        setMessage('エラー: 指定されたカレンダーが見つかりません。URLを確認してください。');
      } else {
        if (localSavedCalendars.some(c => c.view_token === data.view_token)) {
          setMessage('既に登録されています。');
        } else if (data.calendar_id === calendarId) {
          setMessage('自分のカレンダーは登録できません。');
        } else {
          setLocalSavedCalendars([...localSavedCalendars, { calendar_id: data.calendar_id, view_token: data.view_token }]);
          setFollowInput('');
        }
      }
    } catch (err: any) {
      setMessage('エラーが発生しました。');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirm = window.confirm("本当にアカウントを削除しますか？\nこの操作は取り消せません。\nすべての予定・設定が完全に削除されます。");
    if (!confirm) return;

    setSaving(true);
    setMessage('');
    try {
      const { error } = await supabase.from('calendars').delete().eq('calendar_id', calendarId);
      if (error) throw error;
      
      if (onAccountDeleted) {
        onAccountDeleted();
      }
    } catch (err: any) {
      console.error(err);
      setMessage(`削除エラー: ${err.message || 'アカウントの削除に失敗しました'}`);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-gray-800">設定</h2>
            {message && <span className="text-sm text-green-600 font-medium">{message}</span>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
            <X size={20} />
          </button>
        </div>

        {/* Modal Body with Sidebar */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          
          {/* Sidebar Navigation */}
          <div className="w-full md:w-48 border-b md:border-b-0 md:border-r border-gray-200 flex md:flex-col bg-gray-50">
            <button 
              onClick={() => setActiveTab('calendar')}
              className={`px-4 py-3 text-sm font-medium text-left ${activeTab === 'calendar' ? 'bg-white text-blue-600 border-l-4 border-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              カレンダー設定
            </button>
            <button 
              onClick={() => setActiveTab('template')}
              className={`px-4 py-3 text-sm font-medium text-left ${activeTab === 'template' ? 'bg-white text-blue-600 border-l-4 border-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              テンプレート設定
            </button>
            <button 
              onClick={() => setActiveTab('color')}
              className={`px-4 py-3 text-sm font-medium text-left ${activeTab === 'color' ? 'bg-white text-blue-600 border-l-4 border-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              背景カラー設定
            </button>
            <button 
              onClick={() => setActiveTab('follow')}
              className={`px-4 py-3 text-sm font-medium text-left ${activeTab === 'follow' ? 'bg-white text-blue-600 border-l-4 border-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              フォロー設定
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 p-6 overflow-y-auto bg-white">
            
            {/* Calendar Settings */}
            {activeTab === 'calendar' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-semibold mb-3">基本情報</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">カレンダーID (変更不可)</label>
                      <input 
                        type="text" 
                        value={tempId} 
                        disabled
                        className="w-full p-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">パスワード変更</label>
                      <input 
                        type="password" 
                        placeholder="新しいパスワード（変更する場合のみ入力）"
                        value={tempPassword} 
                        onChange={e => setTempPassword(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white" 
                      />
                    </div>
                  </div>
                </div>

                  <div className="pt-4 border-t border-gray-200">
                    <h3 className="text-base font-semibold mb-3">デザイン</h3>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">メインテーマ色</label>
                      <div className="flex items-center gap-3">
                        <input 
                          type="color" 
                          value={localThemeColor} 
                          onChange={e => setLocalThemeColor(e.target.value)}
                          className="w-10 h-10 rounded border border-gray-300 cursor-pointer p-0" 
                        />
                        <input 
                          type="text" 
                          value={localThemeColor}
                          onChange={e => setLocalThemeColor(e.target.value)}
                          className="w-24 p-2 text-sm border border-gray-300 rounded-md uppercase text-gray-900 bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-200 mt-6">
                    <h3 className="text-base font-semibold mb-3 text-red-600">アカウント削除</h3>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={saving}
                      className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 font-medium rounded-md transition-colors disabled:opacity-50 text-sm border border-red-200"
                    >
                      アカウントを削除する
                    </button>
                    <p className="text-xs text-gray-500 mt-2">
                      ※すべての予定や設定が削除され、元に戻すことはできません。
                    </p>
                  </div>
                </div>
              )}

            {/* Template Settings */}
            {activeTab === 'template' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold">テンプレート一覧</h3>
                  <button 
                    onClick={() => setLocalTemplates([...localTemplates, { id: Date.now().toString(), name: '新規', content: '' }])}
                    className="flex items-center gap-1 text-sm bg-blue-50 text-blue-600 px-3 py-1.5 rounded-md hover:bg-blue-100"
                  >
                    <Plus size={16} /> 追加
                  </button>
                </div>
                
                <div className="space-y-4">
                  {localTemplates.map((t, i) => (
                    <div key={t.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50 flex gap-4">
                      <div className="flex-1 space-y-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">テンプレート名</label>
                          <input 
                            type="text" 
                            value={t.name}
                            onChange={(e) => {
                              const newT = [...localTemplates];
                              newT[i].name = e.target.value;
                              setLocalTemplates(newT);
                            }}
                            className="w-full p-2 text-sm border border-gray-300 rounded text-gray-900 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">内容</label>
                          <textarea 
                            value={t.content}
                            onChange={(e) => {
                              const newT = [...localTemplates];
                              newT[i].content = e.target.value;
                              setLocalTemplates(newT);
                            }}
                            className="w-full p-2 text-sm border border-gray-300 rounded resize-y min-h-[60px] text-gray-900 bg-white"
                          />
                        </div>
                      </div>
                      <button 
                        onClick={() => setLocalTemplates(localTemplates.filter(temp => temp.id !== t.id))}
                        className="text-red-500 hover:bg-red-50 p-2 rounded self-start mt-5"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                  {localTemplates.length === 0 && (
                    <div className="text-center text-sm text-gray-500 py-8">テンプレートがありません</div>
                  )}
                </div>
              </div>
            )}

            {/* Background Color Settings */}
            {activeTab === 'color' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold">背景カラー一覧</h3>
                  <button 
                    onClick={() => setLocalColorOptions([...localColorOptions, { id: Date.now().toString(), label: '新規色', value: '#ffffff' }])}
                    className="flex items-center gap-1 text-sm bg-blue-50 text-blue-600 px-3 py-1.5 rounded-md hover:bg-blue-100"
                  >
                    <Plus size={16} /> 追加
                  </button>
                </div>

                <div className="space-y-3">
                  {localColorOptions.map((c, i) => (
                    <div key={c.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50">
                      {c.value === 'transparent' ? (
                        <div className="w-10 h-10 rounded-full border-2 border-dashed border-gray-300 bg-white shrink-0" />
                      ) : (
                        <div className="relative shrink-0">
                          <input 
                            type="color" 
                            value={c.value}
                            onChange={(e) => {
                              const newC = [...localColorOptions];
                              newC[i].value = e.target.value;
                              setLocalColorOptions(newC);
                            }}
                            className="w-10 h-10 rounded cursor-pointer p-0 opacity-0 absolute inset-0 z-10"
                          />
                          <div className="w-10 h-10 rounded-full border border-gray-300" style={{ backgroundColor: c.value }} />
                        </div>
                      )}
                      
                      <div className="flex-1">
                        <input 
                          type="text" 
                          value={c.label}
                          onChange={(e) => {
                            const newC = [...localColorOptions];
                            newC[i].label = e.target.value;
                            setLocalColorOptions(newC);
                          }}
                          placeholder="カラー名"
                          disabled={c.value === 'transparent'}
                          className="w-full p-2 text-sm border border-gray-300 rounded disabled:bg-gray-100 disabled:text-gray-500 text-gray-900 bg-white"
                        />
                      </div>
                      
                      {c.value !== 'transparent' && (
                        <button 
                          onClick={() => setLocalColorOptions(localColorOptions.filter(opt => opt.id !== c.id))}
                          className="text-red-500 hover:bg-red-50 p-2 rounded"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Follow Settings */}
            {activeTab === 'follow' && (
              <div>
                <div className="mb-6">
                  <h3 className="text-base font-semibold mb-3">他人のカレンダーを追加</h3>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={followInput}
                      onChange={e => setFollowInput(e.target.value)}
                      placeholder="閲覧用URL または トークンを入力"
                      className="flex-1 p-2 text-sm border border-gray-300 rounded text-gray-900 bg-white"
                    />
                    <button 
                      onClick={handleAddFollow}
                      disabled={saving || !followInput.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors disabled:opacity-50 shrink-0"
                    >
                      追加
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-semibold mb-3">フォロー中のカレンダー</h3>
                  <div className="space-y-3">
                    {localSavedCalendars.map((c) => (
                      <div key={c.view_token} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-gray-50">
                        <span className="text-sm font-medium text-gray-800">{c.calendar_id}</span>
                        <button 
                          onClick={() => setLocalSavedCalendars(localSavedCalendars.filter(sc => sc.view_token !== c.view_token))}
                          className="text-red-500 hover:bg-red-50 p-2 rounded"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                    {localSavedCalendars.length === 0 && (
                      <div className="text-center text-sm text-gray-500 py-4">登録されているカレンダーはありません</div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
          </div>
          
          {/* Footer Save Button */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}