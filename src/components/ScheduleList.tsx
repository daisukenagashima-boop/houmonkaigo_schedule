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
import { Schedule, Client, UserProfile } from '../types';
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
  Edit2,
  Coffee,
  Sparkles
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
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine' | 'vacancy'>('all');
  const [sortBy, setSortBy] = useState<'kana' | 'area' | 'default'>('kana');

  // Diagnostics and vacancy form states
  const [diagTime, setDiagTime] = useState('10:00');
  const [diagDuration, setDiagDuration] = useState(60); // in minutes
  const [diagCareType, setDiagCareType] = useState<'身体介護' | '生活援助' | '身体・生活'>('身体介護');
  const [diagArea, setDiagArea] = useState('');
  const [diagProspectName, setDiagProspectName] = useState('');
  const [newSchedule, setNewSchedule] = useState<{
    clientId: string;
    caregiverId: string;
    startTime: string;
    endTime: string;
    careType: '身体介護' | '生活援助' | '身体・生活' | 'その他';
  }>({
    clientId: '',
    caregiverId: '',
    startTime: '09:00',
    endTime: '10:00',
    careType: '身体介護'
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
        const staffData = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.displayName || data.name || '不明なスタッフ',
            email: data.email || '',
            role: data.role || 'staff',
            phone: data.phone || '',
            assignedAreas: data.assignedAreas || [],
            status: data.status || 'active',
            offDutyDates: data.offDutyDates || [],
            createdAt: data.createdAt || ''
          } as UserProfile;
        });
        setStaff(staffData.filter(s => s.status !== 'inactive'));
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

  const sortedClients = React.useMemo(() => {
    const list = [...clients];
    if (sortBy === 'kana') {
      return list.sort((a, b) => {
        const fa = a.furigana || a.name || '';
        const fb = b.furigana || b.name || '';
        return fa.localeCompare(fb, 'ja');
      });
    } else if (sortBy === 'area') {
      return list.sort((a, b) => {
        const aa = a.address || '';
        const ab = b.address || '';
        return aa.localeCompare(ab, 'ja');
      });
    }
    return list;
  }, [clients, sortBy]);

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
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-0.5">
            <button
              onClick={() => setFilter('all')}
              className={cn(
                "px-3 md:px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                filter === 'all' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              すべて (割当盤)
            </button>
            <button
              onClick={() => setFilter('mine')}
              className={cn(
                "px-3 md:px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                filter === 'mine' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              自分の担当
            </button>
            <button
              onClick={() => setFilter('vacancy')}
              className={cn(
                "px-3 md:px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1",
                filter === 'vacancy' 
                  ? "bg-emerald-600 text-white shadow-sm font-extrabold" 
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>空き枠・受入診断</span>
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

      {/* Drag & Drop Handlers inside Component */}
      {(() => {
        const START_HOUR = 7;
        const END_HOUR = 21;
        const HOUR_HEIGHT = 96; // 96px matches the h-24 hour height perfectly

        const parseTimeToMinutes = (timeStr: string): number => {
          if (!timeStr) return 0;
          const [h, m] = timeStr.split(':').map(Number);
          return (h || 0) * 60 + (m || 0);
        };

        const getPositionedSchedules = (columnSchedules: Schedule[]) => {
          const sorted = [...columnSchedules].sort((a, b) => a.startTime.localeCompare(b.startTime));
          const clusters: Schedule[][] = [];

          sorted.forEach(sch => {
            const mStart = parseTimeToMinutes(sch.startTime);
            const mEnd = parseTimeToMinutes(sch.endTime);

            let placed = false;
            for (const cluster of clusters) {
              const overlaps = cluster.some(cSch => {
                const cStart = parseTimeToMinutes(cSch.startTime);
                const cEnd = parseTimeToMinutes(cSch.endTime);
                return mStart < cEnd && mEnd > cStart;
              });

              if (overlaps) {
                cluster.push(sch);
                placed = true;
                break;
              }
            }

            if (!placed) {
              clusters.push([sch]);
            }
          });

          const positioned: {
            schedule: Schedule;
            top: number;
            height: number;
            leftPercent: number;
            widthPercent: number;
          }[] = [];

          clusters.forEach(cluster => {
            const lanes: Schedule[][] = [];

            cluster.forEach(sch => {
              const mStart = parseTimeToMinutes(sch.startTime);
              const mEnd = parseTimeToMinutes(sch.endTime);

              let laneIndex = -1;
              for (let i = 0; i < lanes.length; i++) {
                const hasOverlap = lanes[i].some(lSch => {
                  const lStart = parseTimeToMinutes(lSch.startTime);
                  const lEnd = parseTimeToMinutes(lSch.endTime);
                  return mStart < lEnd && mEnd > lStart;
                });

                if (!hasOverlap) {
                  laneIndex = i;
                  break;
                }
              }

              if (laneIndex === -1) {
                lanes.push([sch]);
                laneIndex = lanes.length - 1;
              } else {
                lanes[laneIndex].push(sch);
              }

              (sch as any)._tempLaneIndex = laneIndex;
            });

            const totalLanes = lanes.length;

            cluster.forEach(sch => {
              const laneIndex = (sch as any)._tempLaneIndex;
              delete (sch as any)._tempLaneIndex;

              const mStart = parseTimeToMinutes(sch.startTime);
              const mEnd = parseTimeToMinutes(sch.endTime);

              const startMinutesFromTimelineStart = Math.max(0, mStart - START_HOUR * 60);
              const durationMinutes = Math.max(15, mEnd - mStart);

              const top = startMinutesFromTimelineStart * (96 / 60);
              const height = durationMinutes * (96 / 60);

              const widthPercent = 100 / totalLanes;
              const leftPercent = laneIndex * widthPercent;

              positioned.push({
                schedule: sch,
                top,
                height,
                leftPercent,
                widthPercent
              });
            });
          });

          return positioned;
        };

        const handleDrop = async (scheduleId: string, targetCaregiverId: string) => {
          if (!scheduleId) return;

          try {
            const schedule = todaySchedules.find(s => s.id === scheduleId);
            if (!schedule) return;

            const targetCaregiver = staff.find(s => s.id === targetCaregiverId);
            if (targetCaregiver && targetCaregiver.offDutyDates?.includes(todayStr)) {
              const confirmOverrule = window.confirm(
                `警告: ${targetCaregiver.name}様は本日お休み（休暇設定）です。本当にこの予定を割り当てますか？`
              );
              if (!confirmOverrule) {
                return;
              }
            }

            if (schedule.id.startsWith('recurring-')) {
              await addDoc(collection(db, 'schedules'), {
                clientId: schedule.clientId,
                caregiverId: targetCaregiverId,
                date: todayStr,
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                careType: schedule.careType,
                status: 'scheduled'
              });
            } else {
              await updateDoc(doc(db, 'schedules', schedule.id), {
                caregiverId: targetCaregiverId
              });
            }
          } catch (err) {
            console.error("Drop change error:", err);
            handleFirestoreError(err, OperationType.UPDATE, `schedules/${scheduleId}`);
          }
        };

        const handleToggleOffDuty = async (caregiver: UserProfile) => {
          if (profile?.role !== 'admin') {
            alert("お休みの設定（トグル）は管理者アカウントのみ実行可能です。");
            return;
          }
          const currentOffDutyArr = caregiver.offDutyDates || [];
          let updatedArr: string[];
          const isCurrentlyOff = currentOffDutyArr.includes(todayStr);

          if (isCurrentlyOff) {
            updatedArr = currentOffDutyArr.filter(d => d !== todayStr);
          } else {
            updatedArr = [...currentOffDutyArr, todayStr];
          }

          try {
            await updateDoc(doc(db, 'users', caregiver.id), {
              offDutyDates: updatedArr
            });
          } catch (err) {
            console.error("Failed to toggle off duty:", err);
            alert("休暇設定の更新に失敗しました。");
          }
        };

        return (
          <>
            {/* Visual Timeline Grid when 'all' filter is active */}
            {filter === 'all' && (
              <div className="space-y-4">
                {/* Mobile scroll indicator banner */}
                <div className="lg:hidden flex items-center justify-between gap-2 p-3 bg-emerald-50 border border-emerald-100/60 rounded-xl text-emerald-800 text-[11px] font-bold">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    👈 左右にスワイプしてテーブル全体をスクロールできます 👉
                  </span>
                  <span className="bg-emerald-100/85 px-2 py-0.5 rounded text-[10px] shrink-0">横スクロール可能</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="space-y-0.5">
                    <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      担当ヘルパー別訪問割当盤
                    </h2>
                    <p className="text-xs text-slate-400 font-medium">
                      💡 予定カードをドラッグ＆ドロップして担当ヘルパーを変更することができます。お休み中のスタッフに予定をドラッグした場合は警告が表示されます。
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-sky-50 border border-sky-200 block" />
                      <span>身体介護</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-amber-50 border border-amber-200 block" />
                      <span>生活援助</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded bg-teal-55 border border-teal-200 block" />
                      <span>複合（身体・生活）</span>
                    </div>
                  </div>
                </div>

                {/* The Grid Board Container */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden flex flex-col bg-slate-50/25 max-w-full">
                  {/* Sticky Scrollable Board area */}
                  <div className="overflow-x-auto select-none scrollbar-thin">
                    <div className="min-w-[1250px] flex flex-col">
                      
                      {/* Column Header Titles */}
                      <div className="flex bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-600 h-12">
                        {/* Top-left Corner header */}
                        <div className="w-24 shrink-0 border-r border-slate-250 flex items-center justify-center sticky left-0 bg-slate-100 z-30 font-black">
                          時間帯
                        </div>

                        {/* Unassigned column */}
                        <div className="w-48 shrink-0 border-r border-slate-200 flex items-center justify-center bg-amber-50/40 text-amber-950 font-black gap-1.5">
                          <span>⚠️ 担当未指定</span>
                          <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-full">
                            {todaySchedules.filter(s => !s.caregiverId).length}
                          </span>
                        </div>

                        {/* Staff columns */}
                        {staff.map(member => {
                          const isMemberOff = member.offDutyDates?.includes(todayStr);
                          return (
                            <div 
                              key={member.id} 
                              onClick={() => handleToggleOffDuty(member)}
                              className={cn(
                                "w-48 shrink-0 border-r border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-200/50 transition-colors relative group",
                                isMemberOff ? "bg-red-50 text-red-700" : "bg-slate-100"
                              )}
                            >
                              <span className="font-bold text-slate-800 group-hover:text-emerald-700">
                                {member.name}
                              </span>
                              <span className={cn(
                                "text-[9px] font-bold px-1.5 py-0.5 rounded-md mt-0.5 whitespace-nowrap",
                                isMemberOff 
                                  ? "bg-red-100 text-red-800" 
                                  : member.role === 'admin' 
                                    ? "bg-emerald-100 text-emerald-800" 
                                    : "bg-slate-200 text-slate-600"
                              )}>
                                {isMemberOff ? '😴 休暇設定中' : member.role === 'admin' ? '管理者' : '一般ヘルパー'}
                              </span>
                              {profile?.role === 'admin' && (
                                <span className="absolute bottom-0 text-[7px] text-slate-405 group-hover:block hidden font-medium pb-0.5">
                                  クリックで公休切替
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Timings columns with absolute schedule cards (Google Calendar style) */}
                      <div className="flex bg-white relative" style={{ height: `${(END_HOUR - START_HOUR) * 96}px` }}>
                        
                        {/* Vertical timeline scale column */}
                        <div className="w-24 shrink-0 bg-slate-100 border-r border-slate-250 flex flex-col sticky left-0 z-30 shadow-[1px_0_2px_rgba(0,0,0,0.02)]">
                          {Array.from({ length: END_HOUR - START_HOUR }).map((_, hourOffset) => {
                            const h = START_HOUR + hourOffset;
                            const timeLabel = `${String(h).padStart(2, '0')}:00`;
                            return (
                              <div 
                                key={hourOffset} 
                                className="border-b border-slate-150 flex items-center justify-center font-bold text-slate-700 text-xs bg-slate-100"
                                style={{ height: '96px' }}
                              >
                                {timeLabel}
                              </div>
                            );
                          })}
                        </div>

                        {/* Unassigned column body containing drop zones and absolute cards */}
                        <div 
                          className="w-48 shrink-0 border-r border-slate-200 bg-amber-50/5 relative"
                          style={{ height: `${(END_HOUR - START_HOUR) * 96}px` }}
                        >
                          {/* Hour lines container */}
                          {Array.from({ length: END_HOUR - START_HOUR }).map((_, hourOffset) => (
                            <div 
                              key={hourOffset} 
                              className="border-b border-slate-150 relative bg-white/70"
                              style={{ height: '96px' }}
                            />
                          ))}

                          {/* Invisible hourly drop zones */}
                          {Array.from({ length: END_HOUR - START_HOUR }).map((_, hourOffset) => {
                            const h = START_HOUR + hourOffset;
                            return (
                              <div
                                key={hourOffset}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = 'move';
                                }}
                                onDrop={async (e) => {
                                  e.preventDefault();
                                  const schedId = e.dataTransfer.getData("text/plain");
                                  if (schedId) {
                                    try {
                                      const schedule = todaySchedules.find(s => s.id === schedId);
                                      if (schedule) {
                                        const newStartHour = String(h).padStart(2, '0');
                                        const [origSh, origSm] = schedule.startTime.split(':');
                                        const newStartTime = `${newStartHour}:${origSm || '00'}`;
                                        
                                        const [origEh, origEm] = schedule.endTime.split(':');
                                        const durationHours = parseInt(origEh) - parseInt(origSh);
                                        const newEndHour = String(parseInt(newStartHour) + durationHours).padStart(2, '0');
                                        const newEndTime = `${newEndHour}:${origEm || '00'}`;

                                        if (schedule.id.startsWith('recurring-')) {
                                          await addDoc(collection(db, 'schedules'), {
                                            clientId: schedule.clientId,
                                            caregiverId: '',
                                            date: todayStr,
                                            startTime: newStartTime,
                                            endTime: newEndTime,
                                            careType: schedule.careType,
                                            status: 'scheduled'
                                          });
                                        } else {
                                          await updateDoc(doc(db, 'schedules', schedule.id), {
                                            caregiverId: '',
                                            startTime: newStartTime,
                                            endTime: newEndTime
                                          });
                                        }
                                      }
                                    } catch (err) {
                                      console.error(err);
                                    }
                                  }
                                }}
                                className="absolute left-0 right-0 hover:bg-amber-550/[0.04] transition-colors z-0"
                                style={{ top: `${hourOffset * 96}px`, height: '96px' }}
                              />
                            );
                          })}

                          {/* Placed Cards (Unassigned) */}
                          {getPositionedSchedules(todaySchedules.filter(s => !s.caregiverId)).map(pos => {
                            const schedule = pos.schedule;
                            const client = clients.find(c => c.id === schedule.clientId);
                            const isCompleted = schedule.status === 'completed';
                            const isPhysical = schedule.careType === '身体介護';
                            const isLifeSupport = schedule.careType === '生活援助';
                            const isCoexist = schedule.careType === '身体・生活';

                            return (
                              <div
                                key={schedule.id}
                                draggable={!isCompleted}
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  e.dataTransfer.setData("text/plain", schedule.id);
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectSchedule(schedule);
                                }}
                                style={{
                                  top: `${pos.top}px`,
                                  height: `${pos.height - 2}px`,
                                  left: `calc(${pos.leftPercent}% + 2px)`,
                                  width: `calc(${pos.widthPercent}% - 4px)`,
                                }}
                                className={cn(
                                  "absolute text-[11px] p-2 rounded-xl border border-l-[3.5px] flex flex-col justify-between group/item transition-shadow bg-white shadow-xs z-10 select-none overflow-hidden",
                                  isCompleted ? "opacity-60 border-slate-200 border-l-slate-400 text-slate-500 cursor-default" :
                                  isPhysical ? "border-sky-150 border-l-sky-500 text-sky-950 cursor-grab active:cursor-grabbing hover:shadow-xs" :
                                  isLifeSupport ? "border-amber-100 border-l-amber-500 text-amber-950 cursor-grab active:cursor-grabbing hover:shadow-xs" :
                                  "border-teal-100 border-l-teal-500 text-teal-950 cursor-grab active:cursor-grabbing hover:shadow-xs"
                                )}
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between font-bold text-[9px] text-slate-450 leading-none">
                                    <span>{schedule.startTime} - {schedule.endTime}</span>
                                    {isCompleted ? (
                                      <span className="text-[8px] text-emerald-600 bg-emerald-50 px-1 rounded font-black scale-90">完了</span>
                                    ) : (
                                      <span className="scale-90 font-semibold">{schedule.careType === '身体介護' ? '身体' : schedule.careType === '生活援助' ? '生活' : '複合'}</span>
                                    )}
                                  </div>
                                  <div className="font-extrabold text-slate-900 leading-tight truncate">
                                    {client?.name || '利用対象者'} 様
                                  </div>
                                </div>
                                <div className="text-[9px] text-slate-400 truncate leading-none">
                                  📍 {client?.address?.split('針ヶ谷')?.[1] || client?.address || '長柄町'}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Staff columns body containing drop zones and absolute cards */}
                        {staff.map(member => {
                          const memberSchedules = todaySchedules.filter(s => s.caregiverId === member.id);
                          const isMemberOff = member.offDutyDates?.includes(todayStr);

                          return (
                            <div
                              key={member.id}
                              className={cn(
                                "w-48 shrink-0 border-r border-slate-200 relative",
                                isMemberOff ? "bg-red-50/5 pointer-events-none opacity-50" : "bg-white"
                              )}
                              style={{ height: `${(END_HOUR - START_HOUR) * 96}px` }}
                            >
                              {/* Background lines representing hours */}
                              {Array.from({ length: END_HOUR - START_HOUR }).map((_, hourOffset) => (
                                <div 
                                  key={hourOffset} 
                                  className="border-b border-slate-150"
                                  style={{ height: '96px' }}
                                />
                              ))}

                              {/* Drop zones for each hour slot */}
                              {!isMemberOff && Array.from({ length: END_HOUR - START_HOUR }).map((_, hourOffset) => {
                                const h = START_HOUR + hourOffset;
                                return (
                                  <div
                                    key={hourOffset}
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.dataTransfer.dropEffect = 'move';
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      const schedId = e.dataTransfer.getData("text/plain");
                                      if (schedId) {
                                        const schedule = todaySchedules.find(s => s.id === schedId);
                                        if (schedule) {
                                          const newStartHour = String(h).padStart(2, '0');
                                          const [origSh, origSm] = schedule.startTime.split(':');
                                          const newStartTime = `${newStartHour}:${origSm || '00'}`;

                                          const [origEh, origEm] = schedule.endTime.split(':');
                                          const durationHours = parseInt(origEh) - parseInt(origSh);
                                          const newEndHour = String(parseInt(newStartHour) + durationHours).padStart(2, '0');
                                          const newEndTime = `${newEndHour}:${origEm || '00'}`;

                                          handleDrop(schedId, member.id).then(async () => {
                                            if (!schedule.id.startsWith('recurring-')) {
                                              await updateDoc(doc(db, 'schedules', schedule.id), {
                                                startTime: newStartTime,
                                                endTime: newEndTime
                                              });
                                            }
                                          });
                                        }
                                      }
                                    }}
                                    className="absolute left-0 right-0 hover:bg-emerald-500/[0.04] transition-colors z-0"
                                    style={{ top: `${hourOffset * 96}px`, height: '96px' }}
                                  />
                                );
                              })}

                              {/* Absolutely positioned cards (Caregiver assigned) */}
                              {!isMemberOff && getPositionedSchedules(memberSchedules).map(pos => {
                                const schedule = pos.schedule;
                                const client = clients.find(c => c.id === schedule.clientId);
                                const isCompleted = schedule.status === 'completed';
                                const isPhysical = schedule.careType === '身体介護';
                                const isLifeSupport = schedule.careType === '生活援助';
                                const isCoexist = schedule.careType === '身体・生活';

                                return (
                                  <div
                                    key={schedule.id}
                                    draggable={!isCompleted}
                                    onDragStart={(e) => {
                                      e.stopPropagation();
                                      e.dataTransfer.setData("text/plain", schedule.id);
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectSchedule(schedule);
                                    }}
                                    style={{
                                      top: `${pos.top}px`,
                                      height: `${pos.height - 2}px`,
                                      left: `calc(${pos.leftPercent}% + 2px)`,
                                      width: `calc(${pos.widthPercent}% - 4px)`,
                                    }}
                                    className={cn(
                                      "absolute text-[11px] p-2 rounded-xl border border-l-[3.5px] flex flex-col justify-between group/item transition-shadow bg-white shadow-xs z-10 select-none overflow-hidden",
                                      isCompleted ? "opacity-60 border-slate-200 border-l-slate-400 text-slate-500 cursor-default" :
                                      isPhysical ? "border-sky-150 border-l-sky-500 text-sky-950 cursor-grab active:cursor-grabbing hover:shadow-xs" :
                                      isLifeSupport ? "border-amber-100 border-l-amber-500 text-amber-950 cursor-grab active:cursor-grabbing hover:shadow-xs" :
                                      "border-teal-100 border-l-teal-500 text-teal-950 cursor-grab active:cursor-grabbing hover:shadow-xs"
                                    )}
                                  >
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between font-bold text-[9px] text-slate-450 leading-none">
                                        <span>{schedule.startTime} - {schedule.endTime}</span>
                                        {isCompleted ? (
                                          <span className="text-[8px] text-emerald-600 bg-emerald-50 px-1 rounded font-black scale-90">完了</span>
                                        ) : (
                                          <span className="scale-90 font-semibold">{schedule.careType === '身体介護' ? '身体' : schedule.careType === '生活援助' ? '生活' : '複合'}</span>
                                        )}
                                      </div>
                                      <div className="font-extrabold text-slate-900 leading-tight truncate">
                                        {client?.name || '利用対象者'} 様
                                      </div>
                                    </div>
                                    <div className="text-[9px] text-slate-400 truncate leading-none">
                                      📍 {client?.address?.split('針ヶ谷')?.[1] || client?.address || '長柄町'}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}

                      </div>

                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* Individual Standard List View when 'mine' filter is active (ideal for mobile checklisting) */}
            {filter === 'mine' && (
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
                                schedule.careType === '身体介護' ? "bg-sky-50 text-sky-600 border border-sky-100" : 
                                schedule.careType === '生活援助' ? "bg-amber-50 text-amber-600 border border-amber-100" : 
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
                      <p className="text-slate-500 font-bold">担当する予定はありません</p>
                      <p className="text-sm text-slate-400">ゆっくりお休みください</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {filter === 'vacancy' && (
              <div className="space-y-6">
                {/* Header overview */}
                <div className="bg-[#f0f9f6] border border-emerald-100 rounded-3xl p-5 md:p-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-emerald-600" />
                    <h2 className="text-lg font-black text-emerald-950">
                      空き枠マトリクス ＆ 新規受入判定スピード診断
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    現在、うちの事業所が稼働しているヘルパーの予定表（本日分）を横断スキャンし、希望地域の適合性と時間重複を即座にシミュレーションします。新規のお客様のケアプラン相談や、スポット援助の受け入れを瞬時に診断可能です。
                  </p>
                </div>

                {/* Grid container with Form & Diagnostic Results */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Column: Input Form (5 cols) */}
                  <div className="lg:col-span-5 bg-white border border-slate-100 rounded-3xl p-5 md:p-6 shadow-sm space-y-5">
                    <div className="border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                        <span className="inline-block w-1.5 h-4 bg-emerald-500 rounded-full" />
                        📋 診断条件の指定
                      </h3>
                    </div>

                    <div className="space-y-4">
                      {/* Prospect Name input */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 block">
                          相談・お問合せ者名（任意）
                        </label>
                        <input
                          type="text"
                          value={diagProspectName}
                          onChange={(e) => setDiagProspectName(e.target.value)}
                          placeholder="例：関口 二郎 様（新規相談）"
                          className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-800 font-bold placeholder:text-slate-400 placeholder:font-normal"
                        />
                      </div>

                      {/* Care type selector */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 block">
                          希望サービス種別 *
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {(['身体介護', '生活援助', '身体・生活'] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setDiagCareType(t)}
                              className={cn(
                                "py-2 px-1 rounded-xl text-center text-xs font-black transition-all border",
                                diagCareType === t
                                  ? "bg-emerald-50 border-emerald-500 text-emerald-800"
                                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                              )}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Hopeful Service Time & Preset pills */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 block">
                          希望の時間帯指定 *
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={diagTime}
                            onChange={(e) => setDiagTime(e.target.value)}
                            className="bg-slate-50 border border-slate-200 text-slate-800 font-bold px-3 py-2 rounded-xl text-center text-xs outline-none focus:ring-2 focus:ring-emerald-500/20"
                          />
                          <span className="text-xs text-slate-400 font-bold">から</span>
                          <select
                            value={diagDuration}
                            onChange={(e) => setDiagDuration(Number(e.target.value))}
                            className="bg-slate-50 border border-slate-200 text-slate-800 font-bold px-3 py-2 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-500/20"
                          >
                            <option value={30}>30分間</option>
                            <option value={45}>45分間</option>
                            <option value={60}>60分間 / 1時間</option>
                            <option value={90}>90分間 / 1.5時間</option>
                            <option value={120}>120分間 / 2時間</option>
                          </select>
                        </div>

                        {/* Presets Grid */}
                        <div className="space-y-1 pt-1.5">
                          <span className="text-[10px] text-slate-400 font-bold">⏰ タップで時間プレセット入力:</span>
                          <div className="grid grid-cols-3 gap-1.5">
                            {[
                              { label: "朝 ① (08:30-)", val: "08:30" },
                              { label: "午前 ② (10:00-)", val: "10:00" },
                              { label: "昼 ③ (11:30-)", val: "11:30" },
                              { label: "午後 ④ (13:30-)", val: "13:30" },
                              { label: "夕 ⑤ (15:00-)", val: "15:00" },
                              { label: "夕 ⑥ (16:30-)", val: "16:30" },
                            ].map((preset) => (
                              <button
                                key={preset.val}
                                type="button"
                                onClick={() => setDiagTime(preset.val)}
                                className={cn(
                                  "py-1 px-1 rounded-lg text-[10px] font-bold border transition-colors",
                                  diagTime === preset.val
                                    ? "bg-sky-50 border-sky-450 text-sky-800"
                                    : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                                )}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Area search */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 block">
                          希望地区・訪問住所
                        </label>
                        <input
                          type="text"
                          value={diagArea}
                          onChange={(e) => setDiagArea(e.target.value)}
                          placeholder="例：針ヶ谷、大登、長柄山"
                          className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-800 font-bold placeholder:text-slate-400"
                        />
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <span className="text-[10px] text-slate-400 font-bold">登録地域より抽出:</span>
                          {Array.from(new Set(staff.flatMap(s => s.assignedAreas || []))).slice(0, 5).map(areaName => (
                            <button
                              key={areaName}
                              type="button"
                              onClick={() => setDiagArea(areaName)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-[9px] font-bold px-2 py-0.5 rounded-md cursor-pointer"
                            >
                              🔑 {areaName}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Diagnostic Output (7 cols) */}
                  <div className="lg:col-span-7 bg-white border border-slate-100 rounded-3xl p-5 md:p-6 shadow-sm space-y-6">
                    {/* Header */}
                    <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                      <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                        <span className="inline-block w-1.5 h-4 bg-emerald-500 rounded-full" />
                        📊 診断判定レポート
                      </h3>
                      <span className="text-[10px] text-slate-400 font-bold">
                        今日（{todayStr}）の稼働データ基準
                      </span>
                    </div>

                    {/* Diagnostic evaluation logic inline */}
                    {(() => {
                      const startMin = parseTimeToMinutes(diagTime);
                      const endMin = startMin + diagDuration;
                      const timeStringRepr = `${diagTime} 〜 ${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

                      const userReports = staff.map(member => {
                        const isOff = member.offDutyDates?.includes(todayStr);
                        const memberTodaySchedules = todaySchedules.filter(s => s.caregiverId === member.id && s.status !== 'cancelled');

                        let overlappingSchedule: Schedule | undefined = undefined;
                        let hasOverlap = false;

                        memberTodaySchedules.forEach(sch => {
                          const schStart = parseTimeToMinutes(sch.startTime);
                          const schEnd = parseTimeToMinutes(sch.endTime);
                          if (schStart < endMin && schEnd > startMin) {
                            hasOverlap = true;
                            overlappingSchedule = sch;
                          }
                        });

                        // Check area relevance
                        let areaMatches = true;
                        if (diagArea.trim() !== '') {
                          const queryArea = diagArea.trim().toLowerCase();
                          if (member.assignedAreas && member.assignedAreas.length > 0) {
                            areaMatches = member.assignedAreas.some(area => 
                              area.toLowerCase().includes(queryArea) || queryArea.includes(area.toLowerCase())
                            );
                          } else {
                            areaMatches = false;
                          }
                        }

                        return {
                          member,
                          isOff,
                          totalSchedulesCount: memberTodaySchedules.length,
                          hasOverlap,
                          overlappingSchedule,
                          areaMatches,
                          isFullyAvailable: !isOff && !hasOverlap && areaMatches,
                          isPartiallyAvailable: !isOff && !hasOverlap && !areaMatches
                        };
                      });

                      const fullyAvailable = userReports.filter(r => r.isFullyAvailable);
                      const partiallyAvailable = userReports.filter(r => r.isPartiallyAvailable);
                      const busyCount = userReports.filter(r => r.hasOverlap).length;

                      let status: 'ok' | 'warning' | 'busy' = 'busy';
                      let statusBg = 'bg-rose-50 border-rose-100 text-rose-800';
                      let labelText = '🔴 新規受入：現在困難（空枠なし、要時間調整）';
                      let explanation = 'ご希望の時間帯は、対応可能な全ヘルパーの予定が重複しているか、担当地域対象外/休暇となっております。以下の「代替候補時間」でお客様にご提案ください。';

                      if (fullyAvailable.length > 0) {
                        status = 'ok';
                        statusBg = 'bg-emerald-50 border-emerald-100 text-emerald-800';
                        labelText = `🟢 新規受入：良好（${fullyAvailable.length}名が完全対応可能）`;
                        explanation = `この時間帯（${timeStringRepr}）は、ご希望地区に合致し、完全な空き時間枠のあるヘルパーが ${fullyAvailable.length}名 います！即時の受入が好適です。`;
                      } else if (partiallyAvailable.length > 0) {
                        status = 'warning';
                        statusBg = 'bg-amber-50 border-amber-150 text-amber-900';
                        labelText = `🟡 新規受入：一部調整（${partiallyAvailable.length}名が時間空きあり・エリア外）`;
                        explanation = `時間帯は空いていますが、通常担当地区外のヘルパー（${partiallyAvailable.length}名）が待機中です。移動効率を加味して配置可能か管理者間でご確認ください。`;
                      }

                      // Evaluate alternative times (simulation for other timeframes)
                      const testSlots = [
                        { label: '朝 09:00 - 10:00', start: '09:00', duration: 60 },
                        { label: '午前 10:30 - 11:30', start: '10:30', duration: 60 },
                        { label: '午後 13:00 - 14:00', start: '13:00', duration: 60 },
                        { label: '午後 14:30 - 15:30', start: '14:30', duration: 60 },
                        { label: '夕方 16:00 - 17:00', start: '16:00', duration: 60 },
                      ];

                      const alternatives = testSlots.map(slot => {
                        const slotStart = parseTimeToMinutes(slot.start);
                        const slotEnd = slotStart + slot.duration;

                        const candidates = staff.filter(member => {
                          const isOff = member.offDutyDates?.includes(todayStr);
                          if (isOff) return false;

                          const memberTodaySchedules = todaySchedules.filter(s => s.caregiverId === member.id && s.status !== 'cancelled');
                          const hasOverlap = memberTodaySchedules.some(s => {
                            const schStart = parseTimeToMinutes(s.startTime);
                            const schEnd = parseTimeToMinutes(s.endTime);
                            return schStart < slotEnd && schEnd > slotStart;
                          });

                          if (hasOverlap) return false;

                          // check area if provided
                          if (diagArea.trim() !== '') {
                            const queryArea = diagArea.trim().toLowerCase();
                            if (member.assignedAreas && member.assignedAreas.length > 0) {
                              return member.assignedAreas.some(area => 
                                area.toLowerCase().includes(queryArea) || queryArea.includes(area.toLowerCase())
                              );
                            }
                            return false;
                          }

                          return true;
                        });

                        return {
                          slotLabel: slot.label,
                          startTime: slot.start,
                          candidatesCount: candidates.length,
                          names: candidates.map(c => c.name)
                        };
                      }).filter(alt => alt.candidatesCount > 0);

                      return (
                        <div className="space-y-5">
                          {/* Main Results Banner */}
                          <div className={cn("p-5 rounded-2xl border text-slate-800 space-y-2.5 shadow-2xs", statusBg)}>
                            <p className="font-black text-sm md:text-base flex items-center gap-2">
                              {labelText}
                            </p>
                            <p className="text-[11px] font-bold leading-relaxed opacity-95">
                              {explanation}
                            </p>
                            {diagProspectName.trim() && (
                              <div className="pt-2 border-t border-slate-200/50 flex justify-between items-center text-[10px] font-bold text-slate-600">
                                <span>対象相談者: <strong className="text-slate-900">{diagProspectName} 様</strong></span>
                                <span className="bg-white/80 px-2 py-0.5 rounded border border-slate-100">身体介護・生活援助診断</span>
                              </div>
                            )}
                          </div>

                          {/* Quick Draft assignment trigger */}
                          {fullyAvailable.length > 0 && (
                            <div className="flex items-center justify-between p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                              <div className="space-y-0.5 min-w-0 pr-2">
                                <p className="text-xs font-black text-emerald-950">💡 空き時間を活かして仮予約を登録しますか？</p>
                                <p className="text-[10px] font-bold text-emerald-700 truncate">診断条件を適用したまま予定作成フォームを起動します。</p>
                              </div>
                              <button
                                onClick={() => {
                                  // Open standard add schedule modal
                                  setNewSchedule({
                                    clientId: '', // Leave to select
                                    caregiverId: fullyAvailable[0].member.id,
                                    startTime: diagTime,
                                    endTime: (() => {
                                      const m = parseTimeToMinutes(diagTime) + diagDuration;
                                      const eh = String(Math.floor(m / 60)).padStart(2, '0');
                                      const em = String(m % 60).padStart(2, '0');
                                      return `${eh}:${em}`;
                                    })(),
                                    careType: diagCareType
                                  });
                                  setIsAdding(true);
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 font-extrabold text-[11px] text-white rounded-xl shadow-xs transition-colors whitespace-nowrap cursor-pointer"
                              >
                                仮登録する
                              </button>
                            </div>
                          )}

                          {/* Helpers Status Breakdowns */}
                          <div className="space-y-2.5">
                            <h4 className="text-xs font-extrabold text-slate-700">
                              👥 当時間における全スタッフ稼働分析:
                            </h4>
                            <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin pr-1">
                              {userReports.map(({ member, isOff, hasOverlap, overlappingSchedule, areaMatches, isFullyAvailable }) => {
                                const matchedClient = overlappingSchedule ? clients.find(c => c.id === overlappingSchedule?.clientId) : null;
                                return (
                                  <div 
                                    key={member.id} 
                                    className={cn(
                                      "p-3 rounded-xl border flex items-center justify-between text-xs transition-all",
                                      isOff ? "bg-slate-50 border-slate-100 text-slate-400 opacity-60" :
                                      isFullyAvailable ? "bg-[#f5faf8] border-emerald-200/60 hover:border-emerald-300" :
                                      hasOverlap ? "bg-red-50/20 border-red-100 text-slate-700" :
                                      "bg-slate-50/50 border-slate-200 text-slate-700"
                                    )}
                                  >
                                    <div className="space-y-0.5 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="font-extrabold text-slate-800">{member.name}</p>
                                        <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-extrabold shrink-0">
                                          🏷️ {member.assignedAreas?.join('・') || '全体地区'}
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-slate-400 font-bold">
                                        本日割り当て件数: {member.id ? todaySchedules.filter(s => s.caregiverId === member.id).length : 0}件
                                      </p>
                                    </div>

                                    {/* Evaluation state label */}
                                    <div className="text-right shrink-0">
                                      {isOff ? (
                                        <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-1 rounded-lg font-black">😴 公休・お休み</span>
                                      ) : hasOverlap ? (
                                        <div className="text-right">
                                          <span className="text-[10px] text-rose-700 bg-rose-50 px-2 py-1 rounded-lg font-black border border-rose-100 inline-block">
                                            ❌ 重複（訪問中）
                                          </span>
                                          <span className="block text-[9px] text-rose-500 font-semibold mt-0.5">{overlappingSchedule?.startTime}-{overlappingSchedule?.endTime} {matchedClient?.name ? `${matchedClient.name}様` : '案件あり'}</span>
                                        </div>
                                      ) : !areaMatches ? (
                                        <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded-lg font-black border border-amber-100">
                                          ⚠️ 時間空き・地区外
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-emerald-850 bg-emerald-50 px-2 py-1 rounded-lg font-black border border-emerald-200">
                                          ✅ 完全空き(即割当)
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Alternate Time slots Recommendation block */}
                          <div className="space-y-2 bg-slate-50 p-4.5 rounded-2xl border border-slate-200/70">
                            <h4 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                              📌 推奨：本日空きのある代替時間帯
                            </h4>
                            <p className="text-[10px] text-slate-500">
                              今日（公休日を除く）空枠が十分にあり、お引き受けしやすい時間帯の提案です。
                            </p>
                            <div className="space-y-1.5 pt-1.5">
                              {alternatives.length > 0 ? (
                                alternatives.map((alt, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => {
                                      setDiagTime(alt.startTime);
                                    }}
                                    className="w-full flex items-center justify-between p-2 hover:bg-emerald-50 bg-white border border-slate-200/80 rounded-xl text-[11px] text-slate-705 font-bold transition-colors cursor-pointer group"
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <Clock className="w-3.5 h-3.5 text-emerald-600" />
                                      <strong className="text-slate-900">{alt.slotLabel}</strong>
                                    </span>
                                    <span className="bg-emerald-50 group-hover:bg-emerald-100/80 text-emerald-700 text-[10px] px-2 py-0.5 rounded-lg border border-emerald-100">
                                      ✨ {alt.candidatesCount}名 対応可 ({alt.names.join('・')})
                                    </span>
                                  </button>
                                ))
                              ) : (
                                <p className="text-xs font-bold text-slate-400 py-2 text-center">
                                  現在、本日中に空き時間帯を算出できませんでした。
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Section 2: Comprehensive Visual Vacancy Strip matrix for all helpers */}
                <div className="bg-white border border-slate-100 rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                      <span className="inline-block w-1.5 h-4 bg-[#3a9c82] rounded-full" />
                      🕒 ヘルパー別空き時間帯マトリクス（8:00〜18:00）
                    </h3>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed font-bold">
                    各時間帯の枠： 🟢 ＝ 完全な空き枠（新規対応・移動がスムーズな状態） &nbsp;|&nbsp; 
                    <span className="text-slate-605">🔵 ＝ 訪問中 / 予定割当済</span> &nbsp;|&nbsp; 
                    <span className="text-rose-600">😴 ＝ 休暇設定中</span>
                  </p>

                  <div className="space-y-3 pt-2">
                    {staff.map(member => {
                      const isOff = member.offDutyDates?.includes(todayStr);
                      const memberTodaySchedules = todaySchedules.filter(s => s.caregiverId === member.id && s.status !== 'cancelled');

                      // 1-hour resolution array from 08:00 to 18:00
                      const hoursRange = Array.from({ length: 11 }, (_, i) => 8 + i); // [8, 9, 10, ... 18]

                      return (
                        <div key={member.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100/50 rounded-2xl gap-3 transition-colors border border-slate-100">
                          <div className="w-40 shrink-0 space-y-0.5">
                            <p className="text-xs font-black text-slate-800">{member.name}</p>
                            <span className="inline-block text-[9px] font-black text-slate-600 bg-slate-200/60 px-1.5 py-0.5 rounded">
                              {member.assignedAreas?.join('、') || '指定地域なし'}
                            </span>
                          </div>

                          <div className="flex-1 flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
                            {isOff ? (
                              <div className="w-full text-center text-xs font-extrabold text-red-650 bg-red-50/50 py-1.5 rounded-xl border border-red-100/50">
                                😴 本日公休（休暇に設定されているため終日稼働はありません）
                              </div>
                            ) : (
                              hoursRange.map(hour => {
                                const hourStr = `${String(hour).padStart(2, '0')}:00`;
                                const matchMin = hour * 60;
                                
                                // check if has schedule during this 1-hour segment
                                const segmentEnd = matchMin + 60;
                                const isBusy = memberTodaySchedules.some(s => {
                                  const [sh, sm] = s.startTime.split(':').map(Number);
                                  const [eh, em] = s.endTime.split(':').map(Number);
                                  const startM = sh * 60 + sm;
                                  const endM = eh * 60 + em;
                                  return (startM < segmentEnd && endM > matchMin);
                                });

                                return (
                                  <button
                                    key={hour}
                                    type="button"
                                    onClick={() => {
                                      setDiagTime(`${String(hour).padStart(2, '0')}:00`);
                                      setDiagDuration(60);
                                    }}
                                    className={cn(
                                      "flex-1 min-w-[50px] p-2 rounded-xl text-center flex flex-col justify-between h-14 border transition-all hover:scale-105 active:scale-95 cursor-pointer select-none",
                                      isBusy 
                                        ? "bg-slate-100 border-slate-205 text-slate-400" 
                                        : "bg-emerald-50/70 border-emerald-250 text-emerald-800 font-black shadow-3xs hover:bg-emerald-100"
                                    )}
                                  >
                                    <span className="text-[9px] font-black">{hourStr}</span>
                                    <span className={cn(
                                      "text-[9px] uppercase font-black tracking-wide shrink-0 block text-center rounded py-0.5",
                                      isBusy ? "bg-slate-205 text-slate-600" : "bg-emerald-100 text-emerald-950 font-black"
                                    )}>
                                      {isBusy ? '🔵 訪問' : '🟢 空き'}
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}

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
