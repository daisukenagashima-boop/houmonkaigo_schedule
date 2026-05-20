import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  doc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthGuard';
import { Schedule, Client } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore';
import { 
  Calendar, 
  Clock, 
  User, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle,
  Briefcase,
  Plus,
  X,
  Edit2
} from 'lucide-react';
import { format, getDay, getWeek } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { addDoc } from 'firebase/firestore';

interface ScheduleListProps {
  onSelectSchedule: (schedule: Schedule) => void;
}

export default function ScheduleList({ onSelectSchedule }: ScheduleListProps) {
  const { user, profile } = useAuth();
  const [explicitSchedules, setExplicitSchedules] = useState<Schedule[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [staff, setStaff] = useState<{ id: string, name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine'>('mine');
  const [newSchedule, setNewSchedule] = useState({
    clientId: '',
    caregiverId: '',
    startTime: '09:00',
    endTime: '10:00',
    careType: '身体介護' as const
  });

  useEffect(() => {
    if (editingSchedule) {
      setNewSchedule({
        clientId: editingSchedule.clientId,
        caregiverId: editingSchedule.caregiverId || '',
        startTime: editingSchedule.startTime,
        endTime: editingSchedule.endTime,
        careType: editingSchedule.careType as any
      });
    } else {
      setNewSchedule({
        clientId: '',
        caregiverId: user?.uid || '',
        startTime: '09:00',
        endTime: '10:00',
        careType: '身体介護'
      });
    }
  }, [editingSchedule, user]);

  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');
  const dayOfWeek = getDay(now);
  const weekNum = getWeek(now);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'schedules'),
      where('date', '==', todayStr),
      orderBy('startTime', 'asc')
    );

    const unsubscribeSchedules = onSnapshot(
      q,
      (snapshot) => {
        const schedules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule));
        setExplicitSchedules(schedules);
        setLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'schedules')
    );

    const unsubscribeClients = onSnapshot(
      collection(db, 'clients'),
      (snapshot) => {
        const clientsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
        setClients(clientsData);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'clients')
    );

    const unsubscribeStaff = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const staffData = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          name: doc.data().displayName || doc.data().name || '不明なスタッフ' 
        }));
        setStaff(staffData);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'users')
    );

    return () => {
      unsubscribeSchedules();
      unsubscribeClients();
      unsubscribeStaff();
    };
  }, [user, todayStr]);

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
            const exists = explicitSchedules.some(s => 
              s.clientId === client.id && s.startTime === rs.startTime
            );
            
            if (!exists) {
              derived.push({
                id: `recurring-${client.id}-${rs.startTime}`,
                clientId: client.id,
                caregiverId: '',
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

  const filteredSchedules = todaySchedules.filter(s => 
    filter === 'all' || !s.caregiverId || s.caregiverId === user?.uid
  );

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newSchedule.clientId) return;

    try {
      if (editingSchedule) {
        // If it's a recurring schedule being edited, we create a new explicit one
        if (editingSchedule.id.startsWith('recurring-')) {
          await addDoc(collection(db, 'schedules'), {
            ...newSchedule,
            date: todayStr,
            status: 'planned'
          });
        } else {
          await updateDoc(doc(db, 'schedules', editingSchedule.id), {
            ...newSchedule,
          });
        }
      } else {
        await addDoc(collection(db, 'schedules'), {
          ...newSchedule,
          date: todayStr,
          status: 'planned'
        });
      }
      setIsAdding(false);
      setEditingSchedule(null);
    } catch (error) {
      handleFirestoreError(error, editingSchedule ? OperationType.UPDATE : OperationType.CREATE, 'schedules');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-emerald-600" />
            本日の訪問予定
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            {format(new Date(), 'yyyy年MM月dd日')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-slate-100 p-1 rounded-xl flex">
            <button
              onClick={() => setFilter('mine')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                filter === 'mine' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              自分の担当
            </button>
            <button
              onClick={() => setFilter('all')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                filter === 'all' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              すべて
            </button>
          </div>
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-xl transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            予定を追加
          </button>
        </div>
      </div>

      {/* Visual Timeline Grid when 'all' filter is active */}
      {filter === 'all' && (
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-50 pb-2">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              社内全体スケジュール・空き時間・現在地タイムライン
            </h2>
            <span className="text-[10px] text-slate-400">急遽のキャンセル代行の差し込みに最適化</span>
          </div>

          <div className="space-y-3 pt-2">
            {/* Rows of caregivers including custom 'Unassigned / 未割当' row */}
            {staff.map(caregiver => {
              const assignedSchedules = todaySchedules.filter(s => s.caregiverId === caregiver.id);
              return (
                <div key={caregiver.id} className="grid grid-cols-12 items-center gap-2 p-2 rounded-xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100/50">
                  <div className="col-span-3 text-xs font-bold text-slate-700 truncate flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{caregiver.name}</span>
                  </div>
                  <div className="col-span-9 flex items-center gap-1 overflow-x-auto py-1">
                    {assignedSchedules.length > 0 ? (
                      assignedSchedules.map(sched => (
                        <div
                          key={sched.id}
                          className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg text-[10px] flex-shrink-0 flex items-center gap-1"
                        >
                          <span className="font-bold">{sched.startTime}</span>
                          <span>{clients.find(c => c.id === sched.clientId)?.name || '...'}様 ({sched.careType})</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-300 italic">本日稼働時間なし・空き枠対応可能</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Unassigned row */}
            {todaySchedules.filter(s => !s.caregiverId).length > 0 && (
              <div className="grid grid-cols-12 items-center gap-2 p-2 bg-amber-50/50 rounded-xl border border-amber-150">
                <div className="col-span-3 text-xs font-bold text-amber-700 truncate flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 animate-bounce" />
                  <span>未割り当て (差配待ち)</span>
                </div>
                <div className="col-span-9 flex items-center gap-1 overflow-x-auto py-1">
                  {todaySchedules.filter(s => !s.caregiverId).map(sched => (
                    <div
                      key={sched.id}
                      className="px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-[10px] flex-shrink-0 flex items-center gap-1"
                    >
                      <span className="font-bold">{sched.startTime}</span>
                      <span>{clients.find(c => c.id === sched.clientId)?.name || '...'}様 ({sched.careType})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredSchedules.length > 0 ? (
          filteredSchedules.map((schedule) => {
            const client = clients.find(c => c.id === schedule.clientId);
            const isCompleted = schedule.status === 'completed';

            return (
              <motion.div
                key={schedule.id}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => !isCompleted && onSelectSchedule(schedule)}
                role="button"
                tabIndex={isCompleted ? -1 : 0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (!isCompleted) onSelectSchedule(schedule);
                  }
                }}
                className={cn(
                  "w-full text-left bg-white rounded-3xl p-4 md:p-6 shadow-sm border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer",
                  isCompleted ? "opacity-60 border-slate-100 cursor-default" : "border-slate-100 hover:border-emerald-200 hover:shadow-md"
                )}
              >
                <div className="flex items-center gap-4 md:gap-6 min-w-0">
                  <div className={cn(
                    "w-12 h-12 md:w-16 md:h-16 rounded-2xl flex flex-col items-center justify-center font-bold flex-shrink-0",
                    isCompleted ? "bg-slate-100 text-slate-400" : "bg-emerald-50 text-emerald-600"
                  )}>
                    <Clock className="w-4 h-4 md:w-5 md:h-5 mb-0.5 md:mb-1" />
                    <span className="text-[10px] md:text-xs">{schedule.startTime}</span>
                  </div>
                  
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base md:text-lg font-bold text-slate-900 truncate">
                        {client?.name || '読み込み中...'} 様
                      </h3>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap",
                        schedule.careType === '身体介護' ? "bg-red-50 text-red-600" : 
                        schedule.careType === '生活援助' ? "bg-emerald-50 text-emerald-600" : 
                        "bg-slate-100 text-slate-600"
                      )}>
                        {schedule.careType}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs md:text-sm text-slate-500">
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        <Clock className="w-3 h-3" />
                        {schedule.startTime} - {schedule.endTime}
                      </span>
                      {client?.address && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 transition-colors truncate max-w-[150px] md:max-w-[200px]"
                        >
                          <Briefcase className="w-3 h-3 text-emerald-400" />
                          <span className="underline underline-offset-2 truncate">{client.address}</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0">
                  {schedule.caregiverId ? (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-600 text-[10px] font-bold rounded-full whitespace-nowrap">
                      <User className="w-3 h-3" />
                      {staff.find(s => s.id === schedule.caregiverId)?.name || '担当者'}
                    </div>
                  ) : (
                    <div className="px-3 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-full whitespace-nowrap">
                      担当未定
                    </div>
                  )}
                  <div className="flex items-center gap-1 ml-auto sm:ml-0">
                    {!isCompleted && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingSchedule(schedule);
                          setIsAdding(true);
                        }}
                        className="p-2 text-slate-300 hover:text-emerald-500 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                    {isCompleted ? (
                      <div className="flex items-center gap-1 text-emerald-600 font-bold text-sm px-2 whitespace-nowrap">
                        <CheckCircle2 className="w-5 h-5" />
                        完了
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-emerald-600 font-bold text-sm px-2 whitespace-nowrap">
                        記録入力
                        <ChevronRight className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-200 space-y-4">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8 text-slate-300" />
            </div>
            <div className="space-y-1">
              <p className="text-slate-500 font-bold">本日の予定はありません</p>
              <p className="text-sm text-slate-400">ゆっくりお休みください</p>
            </div>
          </div>
        )}
      </div>

      {/* Add Schedule Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-900">
                  {editingSchedule ? '予定の編集' : '予定の追加'}
                </h2>
                <button 
                  onClick={() => {
                    setIsAdding(false);
                    setEditingSchedule(null);
                  }} 
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAddSchedule} className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">利用者 *</label>
                  <select
                    required
                    value={newSchedule.clientId}
                    onChange={(e) => setNewSchedule({ ...newSchedule, clientId: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="">選択してください</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">開始時間</label>
                    <input
                      type="time"
                      value={newSchedule.startTime}
                      onChange={(e) => setNewSchedule({ ...newSchedule, startTime: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">終了時間</label>
                    <input
                      type="time"
                      value={newSchedule.endTime}
                      onChange={(e) => setNewSchedule({ ...newSchedule, endTime: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">担当者</label>
                  <select
                    value={newSchedule.caregiverId}
                    onChange={(e) => setNewSchedule({ ...newSchedule, caregiverId: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="">担当未定</option>
                    {staff.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">ケア内容</label>
                  <select
                    value={newSchedule.careType}
                    onChange={(e) => setNewSchedule({ ...newSchedule, careType: e.target.value as any })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="身体介護">身体介護</option>
                    <option value="生活援助">生活援助</option>
                    <option value="身体・生活">身体・生活</option>
                    <option value="その他">その他</option>
                  </select>
                </div>
                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAdding(false);
                      setEditingSchedule(null);
                    }}
                    className="flex-1 py-3 px-4 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 px-4 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100"
                  >
                    {editingSchedule ? '更新する' : '追加する'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
