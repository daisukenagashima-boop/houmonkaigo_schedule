import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  where,
  doc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthGuard';
import { Client, CareRecord, Schedule } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore';
import { seedCompleteDemoDatabase } from '../lib/seedData';
import { 
  Users, 
  FileText, 
  PlusCircle, 
  Clock, 
  ChevronRight, 
  Calendar,
  Activity,
  UserCircle,
  MapPin,
  Sparkles,
  Send,
  Building,
  Check,
  AlertTriangle
} from 'lucide-react';
import { format, getDay, getWeek } from 'date-fns';
import { ja } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface DashboardProps {
  onNewRecord: () => void;
  onViewClients: () => void;
  onViewHistory: () => void;
  onViewSchedule: () => void;
  onViewStaff?: () => void;
  onViewMonitoring?: () => void;
  onViewConference?: () => void;
}

interface ChatMessage {
  sender: 'user' | 'assistant';
  text: string;
}

export default function Dashboard({ 
  onNewRecord, 
  onViewClients, 
  onViewHistory, 
  onViewSchedule, 
  onViewStaff,
  onViewMonitoring,
  onViewConference
}: DashboardProps) {
  const { profile, user } = useAuth();
  const [recentRecords, setRecentRecords] = useState<CareRecord[]>([]);
  const [explicitSchedules, setExplicitSchedules] = useState<Schedule[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // AI Chat Assistant State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { sender: 'assistant', text: 'こんにちは！「ながら介護AIアシスタント」へようこそ。現在のご状況、または明日の訪問予定のシミュレーション、キャンセル発生時におけるヘルパー救済調整など、私にお任せください！' }
  ]);
  const [inputText, setInputText] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [proposedActions, setProposedActions] = useState<any[]>([]);
  const [appliedActions, setAppliedActions] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');
  const dayOfWeek = getDay(now);
  const weekNum = getWeek(now);

  useEffect(() => {
    if (!user) return;

    const recordsQuery = query(
      collection(db, 'records'),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const unsubscribeRecords = onSnapshot(
      recordsQuery,
      (snapshot) => {
        setRecentRecords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CareRecord)));
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'records')
    );

    const schedulesQuery = query(
      collection(db, 'schedules'),
      where('date', '==', todayStr),
      orderBy('startTime', 'asc')
    );

    const unsubscribeSchedules = onSnapshot(
      schedulesQuery,
      (snapshot) => {
        setExplicitSchedules(snapshot.docs.map(doc => ({ id: idExtract(doc), ...doc.data() } as Schedule)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'schedules')
    );

    const unsubscribeClients = onSnapshot(
      collection(db, 'clients'),
      (snapshot) => {
        setClients(snapshot.docs.map(doc => ({ id: idExtract(doc), ...doc.data() } as Client)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'clients')
    );

    const unsubscribeUsers = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        setStaff(snapshot.docs.map(doc => ({
          id: idExtract(doc),
          name: doc.data().displayName || doc.data().name || '不明なヘルパー',
          role: doc.data().role || 'staff',
          phone: doc.data().phone || '',
          assignedAreas: doc.data().assignedAreas || [],
          status: doc.data().status || 'active'
        })));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'users')
    );

    function idExtract(s: any) { return s.id; }

    return () => {
      unsubscribeRecords();
      unsubscribeSchedules();
      unsubscribeClients();
      unsubscribeUsers();
    };
  }, [user, todayStr]);

  // Auto-seed baseline data if Firestore is completely empty on load
  useEffect(() => {
    if (!loading && user && clients.length === 0 && !isSeeding) {
      const autoSeedDB = async () => {
        setIsSeeding(true);
        try {
          console.log("Database is empty. Automatically generating high-fidelity demo dataset...");
          await seedCompleteDemoDatabase(user.uid, user.email);
          console.log("Auto-seeding completed successfully!");
        } catch (e: any) {
          console.error("Auto-seeding error:", e);
        } finally {
          setIsSeeding(false);
        }
      };
      autoSeedDB();
    }
  }, [loading, clients.length, user]);

  // Derive today's full schedule
  const todaySchedules = React.useMemo(() => {
    const derived: Schedule[] = [...explicitSchedules];
    
    clients.forEach(client => {
      client.recurringSchedules?.forEach(rs => {
        if (rs.daysOfWeek.includes(dayOfWeek)) {
          const isEvenWeek = weekNum % 2 === 0;
          const matchesFrequency = 
            rs.frequency === 'weekly' || 
            (rs.frequency === 'biweekly_even' && isEvenWeek) ||
            (rs.frequency === 'biweekly_odd' && !isEvenWeek);

          if (matchesFrequency) {
            // Check if there's already an explicit schedule for this client and time
            const exists = explicitSchedules.some(s => 
              s.clientId === client.id && s.startTime === rs.startTime
            );
            
            if (!exists) {
              derived.push({
                id: `recurring-${client.id}-${rs.startTime}`,
                clientId: client.id,
                caregiverId: '', // Unassigned by default
                date: todayStr,
                startTime: rs.startTime,
                endTime: rs.endTime,
                careType: rs.careType,
                status: 'scheduled'
              });
            }
          }
        }
      });
    });

    return derived.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [explicitSchedules, clients, dayOfWeek, weekNum, todayStr]);

  // Handle send message to server-side Gemini Assistant Chat API
  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim()) return;
    
    const newMsgs = [...chatMessages, { sender: 'user' as const, text: textToSend }];
    setChatMessages(newMsgs);
    setInputText('');
    setIsChatLoading(true);
    setProposedActions([]);
    setAppliedActions(false);

    try {
      const res = await fetch('/api/gemini/assistant-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMsgs.map(m => ({ role: m.sender === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })),
          schedules: todaySchedules,
          clients: clients,
          staff: staff
        })
      });

      if (!res.ok) throw new Error('通信エラーが発生しました');
      const data = await res.json();
      
      const responseText = data.text;
      
      // Attempt to extract proposed schedule actions in JSON blocks
      const jsonRegex = /```json\s*([\s\S]+?)\s*```/;
      const match = responseText.match(jsonRegex);
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed.actions) {
            setProposedActions(parsed.actions);
          }
        } catch (e) {
          console.error("Failed to parse proposed actions JSON:", e);
        }
      }

      setChatMessages(prev => [...prev, { sender: 'assistant', text: responseText }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { sender: 'assistant', text: '申し訳ございません。接続に失敗したため、時間をおいて再度お試しください。' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // 1-Click apply schedule proposal
  const handleApplyProposedActions = async () => {
    if (proposedActions.length === 0) return;
    try {
      for (const action of proposedActions) {
        if (action.type === 'reassign' && action.scheduleId) {
          // If it is a recurring derived schedule, we need to add a new explicit schedule in Firestore with caregiverId populated!
          if (action.scheduleId.startsWith('recurring-')) {
            const parts = action.scheduleId.split('-');
            const cid = parts[1];
            const matchingSched = todaySchedules.find(s => s.id === action.scheduleId);
            if (matchingSched) {
              await updateDoc(doc(db, 'schedules'), {
                clientId: matchingSched.clientId,
                caregiverId: action.caregiverId,
                date: todayStr,
                startTime: matchingSched.startTime,
                endTime: matchingSched.endTime,
                careType: matchingSched.careType,
                status: 'scheduled'
              });
            }
          } else {
            // update existing explicit schedule
            await updateDoc(doc(db, 'schedules', action.scheduleId), {
              caregiverId: action.caregiverId,
              status: 'scheduled'
            });
          }
        }
      }
      setAppliedActions(true);
      alert('スケジュール提案が正常に適用されました！');
    } catch (e) {
      console.error(e);
      alert('スケジュールの編集権限エラーまたは保存に失敗しました。');
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-6 md:p-8 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="bg-emerald-55 font-bold text-xs uppercase px-2.5 py-1 rounded-full text-emerald-100">AI搭載 総合プランニング</span>
            <h1 className="text-3xl font-bold">
              こんにちは、{profile?.name}さん
            </h1>
            <p className="text-emerald-100 text-sm">
              {format(new Date(), 'yyyy年MM月dd日 (E)', { locale: ja })} | 訪問介護事業を最適化するための全ての情報がここにまとまっています。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onNewRecord}
              className="flex items-center justify-center gap-2 bg-white text-emerald-700 hover:bg-emerald-50 font-bold py-3 px-6 rounded-2xl transition-all shadow active:scale-95 text-sm"
            >
              <PlusCircle className="w-4 h-4" />
              実績記録
            </button>
            {onViewMonitoring && (
              <button
                onClick={onViewMonitoring}
                className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-3 px-6 rounded-2xl transition-all shadow active:scale-95 text-sm border border-emerald-450"
              >
                <FileText className="w-4 h-4" />
                月報モニタリング
              </button>
            )}
            {onViewConference && (
              <button
                onClick={onViewConference}
                className="flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-400 text-white font-bold py-3 px-6 rounded-2xl transition-all shadow active:scale-95 text-sm border border-teal-450"
              >
                <Building className="w-4 h-4" />
                会議・欠席照会
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Core: Conversational AI Assistant & Operations Gate */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Interactive Chat Window */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col h-[520px] overflow-hidden">
          {/* Assist Header */}
          <div className="bg-slate-50 p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                AI
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">スマート介護相談アシスタント</h3>
                <p className="text-[10px] text-slate-400">日常業務の近道・スケジュール matching 提案</p>
              </div>
            </div>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">稼働中</span>
          </div>

          {/* Dialog Log */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={cn(
                "flex items-start gap-2.5 max-w-[85%]",
                msg.sender === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
              )}>
                {msg.sender === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                    な
                  </div>
                )}
                <div className={cn(
                  "p-3 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-line shadow-sm border",
                  msg.sender === 'user' 
                    ? "bg-emerald-600 text-white border-emerald-600 rounded-tr-none" 
                    : "bg-slate-50 text-slate-800 border-slate-100 rounded-tl-none"
                )}>
                  {msg.text}
                </div>
              </div>
            ))}

            {isChatLoading && (
              <div className="flex items-center gap-2 text-slate-400 text-xs pl-2">
                <Clock className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                AIが明日の全社スケジュール及びキャンセル枠を分析中...
              </div>
            )}

            {/* Smart Correction Proposal container */}
            {proposedActions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-amber-50 rounded-2xl border border-amber-200 mt-4 space-y-3"
              >
                <div className="flex items-center gap-2 text-amber-800 font-bold text-xs sm:text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  AIによる未割当・キャンセル救済提案 ({proposedActions.length}件)
                </div>
                <div className="space-y-2">
                  {proposedActions.map((action, i) => (
                    <div key={i} className="text-xs text-amber-900 leading-relaxed bg-white/80 p-2.5 rounded-lg border border-amber-100">
                      <strong>【変更】</strong> {action.reason || 'ヘルパーへのスケジュール再配置'}
                    </div>
                  ))}
                </div>

                {!appliedActions ? (
                  <button
                    onClick={handleApplyProposedActions}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-95"
                  >
                    このAIのスケジュール修正案を一括適用する
                  </button>
                ) : (
                  <div className="p-2.5 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 border border-emerald-200">
                    <Check size={14} /> スケジュール変更は正常に適用されました！
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* Quick Triggers & Inputs */}
          <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-3 shrink-0">
            {/* Quick Actions buttons */}
            <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1.5">
              <button 
                type="button" 
                onClick={() => handleSendMessage('明日のスケジュールで調整が必要なところや、急遽キャンセルされたヘルパーの給与保障になる代替枠を教えて。')}
                className="px-2.5 py-1.5 bg-white text-slate-700 hover:text-emerald-600 hover:border-emerald-200 text-[10px] font-bold rounded-lg border border-slate-200 shrink-0 transition-all active:scale-95"
              >
                ⏰ スケジュール調整・キャンセル救済
              </button>
              <button 
                type="button" 
                onClick={() => handleSendMessage('利用者のモニタリング報告書の作り方を教えてください')}
                className="px-2.5 py-1.5 bg-white text-slate-700 hover:text-emerald-600 hover:border-emerald-200 text-[10px] font-bold rounded-lg border border-slate-200 shrink-0 transition-all active:scale-95"
              >
                📄 モニタリングシート作成
              </button>
              <button 
                type="button" 
                onClick={() => handleSendMessage('会議に出席できない場合の「照会回答書」のAI自動起案をさせて')}
                className="px-2.5 py-1.5 bg-white text-slate-700 hover:text-emerald-600 hover:border-emerald-200 text-[10px] font-bold rounded-lg border border-slate-200 shrink-0 transition-all active:scale-95"
              >
                ✉️ 欠席・照会回答書
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="話しかけるか、調整作業を指示してください..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendMessage(inputText);
                }}
                className="flex-1 px-4 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={() => handleSendMessage(inputText)}
                disabled={!inputText.trim()}
                className="p-2 sm:px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white rounded-xl transition-all active:scale-95 shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Static fast metrics & schedules preview summary */}
        <div className="lg:col-span-4 space-y-6">
          {/* Quick Menu shortcuts panel */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-2">簡単メニュー一覧</h3>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={onViewClients}
                className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              >
                <div>
                  <h4 className="text-sm font-bold text-slate-800">利用者一覧</h4>
                  <p className="text-[10px] text-slate-500">定期スケジュールの設定・生年月日和暦</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={onViewSchedule}
                className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              >
                <div>
                  <h4 className="text-sm font-bold text-slate-800">全社カレンダー・当日配属</h4>
                  <p className="text-[10px] text-slate-500">空き枠チェック・スポットヘルパー配置</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              {onViewMonitoring && (
                <button
                  onClick={onViewMonitoring}
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-55 hover:bg-slate-100 transition-colors text-left border border-emerald-100"
                >
                  <div className="space-y-0.5">
                    <span className="p-1 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-bold rounded">AI OCR</span>
                    <h4 className="text-sm font-bold text-slate-800">AIモニタリング・居宅目標解析</h4>
                    <p className="text-[10px] text-slate-500">訪問月報の自動作成・印刷プレビュー</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              )}

              {onViewConference && (
                <button
                  onClick={onViewConference}
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-605 hover:bg-slate-100 transition-colors text-left border border-teal-100"
                >
                  <div className="space-y-0.5">
                    <span className="p-1 py-0.5 bg-teal-100 text-teal-800 text-[9px] font-bold rounded">AI REPLY</span>
                    <h4 className="text-sm font-bold text-slate-800">サービス担当者会議支援</h4>
                    <p className="text-[10px] text-slate-500">欠席時「照会回答書」作成</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>
          </div>

          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-150 space-y-2">
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-widest text-slate-400">実績・経営モニター</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              スポットワーカーの安定的な就業・介護報酬損失防止のため、急なキャンセル案件が生じた場合は「ながらAI」で代替割り当てボタンを押し、当日中にスケジュール修正を完了させてください。
            </p>
          </div>
        </div>

      </div>

      {/* Stats Grid */}
      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-1 pb-1 pt-4">
        📊 現在の事業所パフォーマンス指標
      </h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard 
          icon={<Users className="w-6 h-6 text-emerald-600" />} 
          label="管理利用者" 
          value={clients.length.toString()} 
          onClick={onViewClients}
        />
        <StatCard 
          icon={<Calendar className="w-6 h-6 text-emerald-600" />} 
          label="本日の訪問予定数" 
          value={todaySchedules.length.toString()} 
          onClick={onViewSchedule}
        />
        <StatCard 
          icon={<Clock className="w-6 h-6 text-emerald-500" />} 
          label="保存済み記録ログ" 
          value={recentRecords.length.toString()} 
          onClick={onViewHistory}
        />
        {profile?.role === 'admin' && (
          <StatCard 
            icon={<UserCircle className="w-6 h-6 text-emerald-700" />} 
            label="本日の担当スタッフ" 
            value={staff.length.toString()} 
            onClick={onViewStaff || (() => {})}
          />
        )}
      </div>

      {/* Today's Schedule Summary */}
      <div className="bg-white rounded-3xl p-5 md:p-8 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-600" />
            本日の訪問予定
          </h2>
          <button 
            onClick={onViewSchedule}
            className="text-emerald-600 hover:text-emerald-700 font-medium text-sm flex items-center gap-1"
          >
            すべて見る
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {todaySchedules.length > 0 ? (
            todaySchedules.slice(0, 3).map((schedule) => (
              <div key={schedule.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl gap-3">
                <div className="flex items-center gap-3 md:gap-4 min-w-0">
                  <div className="text-xs md:text-sm font-bold text-emerald-600 w-10 md:w-12 flex-shrink-0">
                    {schedule.startTime}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">
                      {clients.find(c => c.id === schedule.clientId)?.name || '...'}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <p className="text-[10px] md:text-xs text-slate-500 {schedule.caregiverId ? '' : 'text-amber-600 font-bold'}">{schedule.careType} • {schedule.caregiverId ? (staff.find(s=>s.id === schedule.caregiverId)?.name || '未指定ヘルパー') : '要ヘルパー差配'}</p>
                      {clients.find(c => c.id === schedule.clientId)?.address && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clients.find(c => c.id === schedule.clientId)!.address!)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-0.5 text-[10px] text-emerald-600 hover:text-emerald-700 transition-colors underline underline-offset-2 truncate max-w-[120px] md:max-w-[180px]"
                        >
                          <MapPin size={10} className="text-emerald-400" />
                          <span className="truncate">{clients.find(c => c.id === schedule.clientId)?.address}</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className={cn(
                    "px-2 md:px-3 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap",
                    schedule.status === 'completed' ? "bg-emerald-100 text-emerald-700" : 
                    !schedule.caregiverId ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-600"
                  )}>
                    {schedule.status === 'completed' ? '完了' : !schedule.caregiverId ? '未割当' : '予定'}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-center py-4 text-slate-400 text-sm">本日の予定はありません</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, onClick }: { icon: React.ReactNode, label: string, value: string, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-6 hover:shadow-md transition-all text-left active:scale-[0.98]"
    >
      <div className="w-10 h-10 md:w-14 md:h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-xl md:text-2xl flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] md:text-sm font-medium text-slate-500 truncate">{label}</p>
        <p className="text-lg md:text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </button>
  );
}
