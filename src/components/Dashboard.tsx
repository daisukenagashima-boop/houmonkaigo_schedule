import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  where,
  doc,
  updateDoc,
  addDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthGuard';
import { Client, CareRecord, Schedule } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore';
import { seedCompleteDemoDatabase, wipeAllDemoData } from '../lib/seedData';
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
    { sender: 'assistant', text: 'こんにちは！「ながらAI」です。本日のご状況、明日の訪問予定のシミュレーション、急なキャンセル発生時のヘルパー再割り当てなど、お気軽にご相談ください。' }
  ]);
  const [inputText, setInputText] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [proposedActions, setProposedActions] = useState<any[]>([]);
  const [appliedActions, setAppliedActions] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

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
      collection(db, 'schedules')
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

  // 自動シードは廃止しました。重複投入の事故を防ぐため、シードは管理者の手動ボタン
  // (handleResetAndReseed) からのみ実行可能とします。
  // 旧コードは git history に残っています。

  // 管理者用: デモデータの完全リセット&再投入
  const handleResetAndReseed = async () => {
    if (!user) return;
    const confirmed = window.confirm(
      'デモデータを全てリセットして「訪問介護ステーションながら（岐阜市、利用者60名）」の最新データを投入します。\n\n既存のデータ（利用者・スタッフ・スケジュール・記録・ケアプラン）はすべて削除されます。よろしいですか？'
    );
    if (!confirmed) return;
    setIsResetting(true);
    try {
      await seedCompleteDemoDatabase(user.uid, user.email);
      alert('✅ デモデータを再投入しました！「訪問介護ステーションながら」のデータが反映されています。');
    } catch (e: any) {
      console.error('Reset & reseed failed:', e);
      alert(`❌ 再投入に失敗しました: ${e.message || e}`);
    } finally {
      setIsResetting(false);
    }
  };

  // 管理者用: 全データ完全削除（投入はしない）
  const handleWipeOnly = async () => {
    if (!user) return;
    const confirmed = window.confirm(
      '⚠️ 警告: Firestoreの全データを完全に削除します。\n\n利用者・スタッフ・スケジュール・記録・ケアプラン・モニタリング報告書・照会回答書がすべて削除されます。\n\n本当によろしいですか？'
    );
    if (!confirmed) return;
    const doubleConfirm = window.confirm('もう一度確認します。本当に全データを削除しますか？');
    if (!doubleConfirm) return;
    setIsResetting(true);
    try {
      await wipeAllDemoData(user.uid);
      alert('🗑 全データを削除しました。「デモデータ再投入」ボタンで新しいデータを投入してください。');
    } catch (e: any) {
      console.error('Wipe failed:', e);
      alert(`❌ 削除に失敗しました: ${e.message || e}`);
    } finally {
      setIsResetting(false);
    }
  };

  // Derive today's full schedule
  const todaySchedules = React.useMemo(() => {
    const todayExplicit = explicitSchedules.filter(s => s.date === todayStr);
    const derived: Schedule[] = [...todayExplicit];
    
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
            const exists = todayExplicit.some(s => 
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

  // Compute monthly statistics
  const monthlyStats = React.useMemo(() => {
    const currentMonthPrefix = format(new Date(), 'yyyy-MM');
    const monthSchedules = explicitSchedules.filter(s => s.date.startsWith(currentMonthPrefix));
    
    let physicalCount = 0;
    let lifeCount = 0;
    let mixedCount = 0;
    let otherCount = 0;
    
    monthSchedules.forEach(s => {
      if (s.careType === '身体介護') {
        physicalCount++;
      } else if (s.careType === '生活援助') {
        lifeCount++;
      } else if (s.careType === '身体・生活') {
        mixedCount++;
      } else {
        otherCount++;
      }
    });
    
    return {
      total: monthSchedules.length,
      physical: physicalCount,
      life: lifeCount,
      mixed: mixedCount,
      other: otherCount,
      monthLabel: format(new Date(), 'M月')
    };
  }, [explicitSchedules]);

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
      
      // AI応答内の ```json ... ``` ブロックから1クリック適用アクションを抽出
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

      // チャットには JSON ブロックを除去した「人が読む部分」だけ表示
      const displayText = responseText.replace(jsonRegex, '').replace(/\n{3,}/g, '\n\n').trim();
      setChatMessages(prev => [...prev, { sender: 'assistant', text: displayText }]);
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
              await addDoc(collection(db, 'schedules'), {
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
    <div className="space-y-8 pb-12 bg-[#faf9f6]/30">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#2f7d6a] via-[#3a9c82] to-[#cb846f] rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden transition-all duration-300">
        {/* Decorative ambient bubble patterns */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-200/10 rounded-full blur-2xl -ml-20 -mb-20 pointer-events-none"></div>

        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6 z-10">
          <div className="space-y-2">
            <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
              こんにちは、{profile?.name || 'ヘルパー'} さん
            </h1>
            <p className="text-emerald-50/90 text-xs sm:text-sm font-bold">
              {format(new Date(), 'yyyy年MM月dd日 (E)', { locale: ja })}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onNewRecord}
              className="flex items-center justify-center gap-2 bg-white text-emerald-800 hover:bg-amber-50 font-black py-3.5 px-6 rounded-2xl transition-all shadow-md active:scale-95 text-xs sm:text-sm cursor-pointer"
            >
              <PlusCircle className="w-5 h-5 text-emerald-600" />
              実績記録を記入
            </button>
            {profile?.role === 'admin' && (
              <>
                <button
                  onClick={handleResetAndReseed}
                  disabled={isResetting}
                  title="デモデータをリセットして「訪問介護ステーションながら」の最新データを投入"
                  className="flex items-center justify-center gap-2 bg-slate-900/40 hover:bg-slate-900/55 disabled:opacity-40 text-white/90 font-bold py-3.5 px-5 rounded-2xl transition-all shadow-md active:scale-95 text-xs border border-white/20 backdrop-blur-md cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-200" />
                  {isResetting ? '処理中…' : 'デモデータ再投入'}
                </button>
                <button
                  onClick={handleWipeOnly}
                  disabled={isResetting}
                  title="Firestoreの全データを完全削除（投入なし）"
                  className="flex items-center justify-center gap-2 bg-red-500/40 hover:bg-red-500/60 disabled:opacity-40 text-white/90 font-bold py-3.5 px-5 rounded-2xl transition-all shadow-md active:scale-95 text-xs border border-white/20 backdrop-blur-md cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4 text-red-200" />
                  全データ削除
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6 pt-2">
        <StatCard
          icon={<Users className="w-6 h-6 text-emerald-600" />}
          label="担当の利用者様"
          value={`${clients.length} 名`}
          subtext=""
          onClick={onViewClients}
          colorClass={{
            bg: "bg-emerald-50/70 hover:bg-emerald-100/80",
            border: "border-emerald-100/80 hover:border-emerald-200",
            iconBg: "bg-emerald-100 text-emerald-700",
            labelText: "text-emerald-800/90",
            valueText: "text-emerald-950 font-black",
            subtextColor: "text-emerald-600/80"
          }}
        />
        <StatCard
          icon={<Calendar className="w-6 h-6 text-amber-600" />}
          label="本日の訪問予定"
          value={`${todaySchedules.length} 件`}
          subtext={todaySchedules.filter(s => !s.caregiverId).length > 0 ? `⚠ 未割当 ${todaySchedules.filter(s => !s.caregiverId).length} 件` : "全て割当済"}
          onClick={onViewSchedule}
          colorClass={{
            bg: "bg-amber-50/70 hover:bg-amber-100/80",
            border: "border-amber-100/80 hover:border-amber-200",
            iconBg: "bg-amber-100 text-amber-700",
            labelText: "text-amber-800/90",
            valueText: "text-amber-950 font-black",
            subtextColor: todaySchedules.filter(s => !s.caregiverId).length > 0 ? "text-rose-600 font-extrabold" : "text-amber-600/80"
          }}
        />
        <StatCard
          icon={<Clock className="w-6 h-6 text-sky-600" />}
          label="今月のサービス実績"
          value={`${recentRecords.length} 件`}
          subtext=""
          onClick={onViewHistory}
          colorClass={{
            bg: "bg-sky-50/70 hover:bg-sky-100/80",
            border: "border-sky-100/80 hover:border-sky-200",
            iconBg: "bg-sky-100 text-sky-700",
            labelText: "text-sky-800/90",
            valueText: "text-sky-950 font-black",
            subtextColor: "text-sky-600/80"
          }}
        />
        {profile?.role === 'admin' ? (
          <StatCard
            icon={<UserCircle className="w-6 h-6 text-purple-600" />}
            label="本日の勤務ヘルパー"
            value={`${staff.length} 名`}
            subtext=""
            onClick={onViewStaff || (() => {})}
            colorClass={{
              bg: "bg-purple-50/70 hover:bg-purple-100/80",
              border: "border-purple-100/80 hover:border-purple-200",
              iconBg: "bg-purple-100 text-purple-700",
              labelText: "text-purple-800/90",
              valueText: "text-purple-950 font-black",
              subtextColor: "text-purple-600/80"
            }}
          />
        ) : (
          <StatCard
            icon={<UserCircle className="w-6 h-6 text-purple-600" />}
            label="ログイン中"
            value={`${profile?.name || 'ゲスト'} 様`}
            subtext=""
            onClick={() => {}}
            colorClass={{
              bg: "bg-purple-50/70 hover:bg-purple-100/80",
              border: "border-purple-100/80 hover:border-purple-200",
              iconBg: "bg-purple-100 text-purple-700",
              labelText: "text-purple-800/90",
              valueText: "text-purple-950 font-black",
              subtextColor: "text-purple-600/80"
            }}
          />
        )}
        <StatCard
          icon={<Activity className="w-6 h-6 text-rose-600" />}
          label={`${monthlyStats.monthLabel}の訪問総数`}
          value={`${monthlyStats.total} 件`}
          subtext=""
          onClick={onViewSchedule}
          colorClass={{
            bg: "bg-rose-50/70 hover:bg-rose-100/80",
            border: "border-rose-100/80 hover:border-rose-200",
            iconBg: "bg-rose-100 text-rose-700",
            labelText: "text-rose-800/90",
            valueText: "text-rose-950 font-black",
            subtextColor: "text-rose-600/80"
          }}
        />
        <StatCard 
          icon={<FileText className="w-6 h-6 text-teal-600" />} 
          label={`${monthlyStats.monthLabel}のサービス内訳`} 
          value={
            <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold leading-none pt-1">
              <span className="flex items-center gap-1 bg-sky-100 text-sky-800 px-2 py-1.5 rounded-lg">
                身体: {monthlyStats.physical}件
              </span>
              <span className="flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-1.5 rounded-lg">
                生活: {monthlyStats.life}件
              </span>
              <span className="flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2 py-1.5 rounded-lg">
                身体生活: {monthlyStats.mixed}件
              </span>
              {monthlyStats.other > 0 && (
                <span className="flex items-center gap-1 bg-slate-100 text-slate-800 px-2 py-1.5 rounded-lg">
                  他: {monthlyStats.other}件
                </span>
              )}
            </div>
          } 
          subtext=""
          onClick={onViewSchedule}
          colorClass={{
            bg: "bg-teal-50/70 hover:bg-teal-100/80",
            border: "border-teal-100/80 hover:border-teal-200",
            iconBg: "bg-teal-100 text-teal-700",
            labelText: "text-teal-800/90",
            valueText: "text-teal-950",
            subtextColor: "text-teal-600/80"
          }}
        />
      </div>

      {/* Main Core: Conversational AI Assistant & Operations Gate */}
      <div className="grid grid-cols-1 gap-8">

        {/* Interactive Chat Window */}
        <div className="bg-white rounded-3xl border-2 border-rose-100/60 shadow-md flex flex-col h-[640px] overflow-hidden">
          {/* Assist Header */}
          <div className="bg-gradient-to-r from-rose-50 to-amber-50 p-4 border-b border-rose-100/60 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-tr from-rose-400 to-amber-500 rounded-2xl flex items-center justify-center text-white font-black text-base shadow-sm">
                な
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black text-slate-800 flex items-center gap-1.5">
                  ながらAI
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">介護業務サポート</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-bold">キャンセル時の再割り当て、報告書の作成など、お気軽にご相談ください</p>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-black rounded-full animate-pulse">
              稼働中
            </span>
          </div>

          {/* Dialog Log */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#fdfbf7]/60">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={cn(
                "flex items-start gap-3 max-w-[90%] transition-all",
                msg.sender === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
              )}>
                {msg.sender === 'assistant' ? (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-300 to-amber-300 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                    な
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 font-black text-xs flex items-center justify-center shrink-0 border border-slate-300">
                    私
                  </div>
                )}
                <div className={cn(
                  "p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-line shadow-xs border transition-shadow",
                  msg.sender === 'user' 
                    ? "bg-[#cb846f] text-white border-[#cb846f] rounded-tr-none font-bold" 
                    : "bg-white text-slate-800 border-rose-100/70 rounded-tl-none font-bold"
                )}>
                  {msg.text}
                </div>
              </div>
            ))}

            {isChatLoading && (
              <div className="flex items-center gap-2 text-slate-500 text-sm pl-2 font-bold bg-white/75 p-3 rounded-xl border border-rose-50 w-fit">
                <Clock className="w-4 h-4 animate-spin text-rose-500" />
                AIが事業所の状況を優しく分析中（少々お待ちくださいね...）
              </div>
            )}

            {/* Smart Correction Proposal container */}
            {proposedActions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-amber-50 rounded-2xl border-2 border-amber-200/80 mt-4 space-y-3"
              >
                <div className="flex items-center gap-2 text-amber-800 font-extrabold text-sm">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  ながらAIからの提案 ({proposedActions.length}件)
                </div>
                <div className="space-y-2">
                  {proposedActions.map((action, i) => (
                    <div key={i} className="text-xs sm:text-sm text-slate-700 leading-relaxed bg-white/95 p-3 rounded-xl border border-amber-100 shadow-2xs font-bold">
                      <span className="text-amber-700 font-black mr-1">【ご提案】</span> {action.reason || 'スケジュール割り当ての調整'}
                    </div>
                  ))}
                </div>

                {!appliedActions ? (
                  <button
                    onClick={handleApplyProposedActions}
                    className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-black text-sm shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    このスケジュール調整案を適用する
                  </button>
                ) : (
                  <div className="p-3 bg-emerald-50 text-emerald-800 text-sm font-black rounded-xl flex items-center justify-center gap-1.5 border border-emerald-200">
                    <Check size={16} /> スケジュールを優しく更新しました！
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* Quick Triggers & Inputs */}
          <div className="p-4 border-t border-rose-50 bg-[#faf8f4] space-y-4 shrink-0">
            {/* Quick Actions buttons */}
            <div className="space-y-1">
              <span className="text-[11px] text-slate-400 font-black block tracking-wider uppercase">よく使う質問</span>
              <div className="flex flex-wrap gap-2 overflow-x-auto pb-1.5">
                <button 
                  type="button" 
                  onClick={() => handleSendMessage('明日のスケジュールで調整が必要なところや、急遽キャンセルされたヘルパーの給与保障になる代替枠を教えて。')}
                  className="px-3 py-2 bg-white text-slate-700 hover:text-rose-600 hover:border-rose-300 text-xs font-bold rounded-xl border border-slate-200 shadow-2xs shrink-0 transition-all active:scale-95 cursor-pointer"
                >
                  ⏰ スケジュール調整・キャンセル救済
                </button>
                <button 
                  type="button" 
                  onClick={() => handleSendMessage('利用者のモニタリング報告書の作り方を教えてください')}
                  className="px-3 py-2 bg-white text-slate-700 hover:text-rose-600 hover:border-rose-300 text-xs font-bold rounded-xl border border-slate-200 shadow-2xs shrink-0 transition-all active:scale-95 cursor-pointer"
                >
                  📄 モニタリング報告書作成
                </button>
                <button 
                  type="button" 
                  onClick={() => handleSendMessage('会議に出席できない場合の「照会回答書」のAI自動起案をさせて')}
                  className="px-3 py-2 bg-white text-slate-700 hover:text-rose-600 hover:border-rose-300 text-xs font-bold rounded-xl border border-slate-200 shadow-2xs shrink-0 transition-all active:scale-95 cursor-pointer"
                >
                  ✉️ 欠席・照会回答書を作る
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="何か困ったことはありますか？調整作業の相談などを入力してください..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  // IME変換中のEnterは無視（変換確定で送信されてしまうのを防ぐ）
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(inputText);
                  }
                }}
                className="flex-1 px-4 py-2.5 text-sm bg-white border border-rose-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400 font-medium placeholder-slate-400"
              />
              <button
                onClick={() => handleSendMessage(inputText)}
                disabled={!inputText.trim()}
                className="p-3 bg-rose-500 hover:bg-rose-600 disabled:bg-slate-200 text-white rounded-xl transition-all active:scale-95 shrink-0 cursor-pointer"
              >
                <Send className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function StatCard({ 
  icon, 
  label, 
  value, 
  subtext,
  onClick, 
  colorClass 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: React.ReactNode; 
  subtext?: string;
  onClick: () => void; 
  colorClass: { 
    bg: string; 
    border: string; 
    iconBg: string; 
    labelText: string; 
    valueText: string;
    subtextColor?: string;
  };
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-5 rounded-3xl shadow-xs transition-all text-left active:scale-[0.98] hover:shadow-md border flex flex-col justify-between min-h-[144px] min-w-0 group cursor-pointer w-full",
        colorClass.bg,
        colorClass.border
      )}
    >
      <div className="flex items-center justify-between w-full">
        <span className={cn("text-xs sm:text-[13px] font-black tracking-tight", colorClass.labelText)}>
          {label}
        </span>
        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", colorClass.iconBg)}>
          {icon}
        </div>
      </div>
      <div className="min-w-0 mt-3 space-y-1">
        {typeof value === 'string' ? (
          <p className={cn("text-2xl sm:text-3xl font-black tracking-tight leading-none", colorClass.valueText)}>
            {value}
          </p>
        ) : (
          value
        )}
        {subtext && (
          <p className={cn("text-[11px] font-bold mt-1 line-clamp-1 leading-normal", colorClass.subtextColor || "text-slate-500")}>
            {subtext}
          </p>
        )}
      </div>
    </button>
  );
}
