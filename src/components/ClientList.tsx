import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Client } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore';
import { toWareki, fromWareki, ERAS } from '../lib/utils';
import { useAuth } from './AuthGuard';
import { seedCompleteDemoDatabase } from '../lib/seedData';
import { 
  Users, 
  Plus, 
  Search, 
  MoreVertical, 
  Trash2, 
  Edit2, 
  X,
  UserPlus,
  MapPin,
  Phone,
  FileText,
  Clock,
  Calendar,
  Trash,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { RecurringSchedule } from '../types';
import { cn } from '../lib/utils';

const DAYS_JP = ["日", "月", "火", "水", "木", "金", "土"];

interface ClientListProps {
  onSelectClient?: (clientId: string) => void;
}

export default function ClientList({ onSelectClient }: ClientListProps = {}) {
  const { user } = useAuth();
  const [isSeeding, setIsSeeding] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [sortBy, setSortBy] = useState<'kana' | 'area' | 'default'>('kana');

  // Custom visual state overlays to ensure proper execution in iframe sandboxes!
  const [showConfirmSeed, setShowConfirmSeed] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);

  const handleRegisterDummyClients = async () => {
    if (!user) {
      setErrorMessage("ログイン状態が取得できません。再度ログインしてください。");
      return;
    }
    setShowConfirmSeed(false);
    setIsSeeding(true);
    try {
      await seedCompleteDemoDatabase(user.uid, user.email || undefined);
      setShowSuccessModal(true);
    } catch (e: any) {
      console.error(e);
      setErrorMessage("エラーが発生しました: " + e.message);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleDeleteClientClick = (id: string) => {
    setDeletingClientId(id);
  };

  const confirmDeleteClient = async () => {
    if (!deletingClientId) return;
    const targetId = deletingClientId;
    setDeletingClientId(null);
    try {
      await deleteDoc(doc(db, 'clients', targetId));
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, `clients/${targetId}`);
      setErrorMessage(error.message || '利用者の削除に失敗しました。');
    }
  };

  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [newClient, setNewClient] = useState({
    name: '',
    furigana: '',
    birthDate: '1940-01-01',
    gender: 'male' as 'male' | 'female' | 'other',
    address: '',
    notes: '',
    recurringSchedules: [] as RecurringSchedule[]
  });

  const calculateAge = (birthDate: string) => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const getWarekiParts = (dateStr: string) => {
    if (!dateStr) return { era: '昭和', year: 1, month: 1, day: 1 };
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    for (const era of ERAS) {
      if (dateStr >= era.start) {
        return {
          era: era.name,
          year: year - era.startYear + 1,
          month,
          day
        };
      }
    }
    // Default to Showa if older than Meiji or something
    return { era: '昭和', year: 1, month: 1, day: 1 };
  };

  const currentWareki = getWarekiParts(newClient.birthDate);

  const handleWarekiUpdate = (field: string, value: any) => {
    const parts = { ...currentWareki, [field]: value };
    const isoDate = fromWareki(parts.era, parts.year, parts.month, parts.day);
    setNewClient(prev => ({ ...prev, birthDate: isoDate }));
  };

  useEffect(() => {
    if (editingClient) {
      setNewClient({
        name: editingClient.name,
        furigana: editingClient.furigana || '',
        birthDate: editingClient.birthDate || '',
        gender: editingClient.gender || 'male',
        address: editingClient.address || '',
        notes: editingClient.notes || '',
        recurringSchedules: editingClient.recurringSchedules || []
      });
    } else {
      setNewClient({
        name: '',
        furigana: '',
        birthDate: '1940-01-01',
        gender: 'male',
        address: '',
        notes: '',
        recurringSchedules: []
      });
    }
  }, [editingClient]);

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClient.name || !newClient.birthDate) return;

    const age = calculateAge(newClient.birthDate);

    try {
      if (editingClient) {
        await updateDoc(doc(db, 'clients', editingClient.id), {
          ...newClient,
          age,
        });
      } else {
        await addDoc(collection(db, 'clients'), {
          ...newClient,
          age,
          createdAt: new Date().toISOString()
        });
      }
      setIsAdding(false);
      setEditingClient(null);
    } catch (error) {
      handleFirestoreError(error, editingClient ? OperationType.UPDATE : OperationType.CREATE, 'clients');
    }
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'clients'),
      (snapshot) => {
        setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'clients')
    );
    return () => unsubscribe();
  }, []);

  const addRecurringSchedule = () => {
    setNewClient({
      ...newClient,
      recurringSchedules: [
        ...newClient.recurringSchedules,
        { daysOfWeek: [1], startTime: '09:00', endTime: '10:00', careType: '身体介護', frequency: 'weekly' }
      ]
    });
  };

  const duplicateRecurringSchedule = (index: number) => {
    const scheduleToCopy = newClient.recurringSchedules[index];
    setNewClient({
      ...newClient,
      recurringSchedules: [
        ...newClient.recurringSchedules,
        { ...scheduleToCopy }
      ]
    });
  };

  const removeRecurringSchedule = (index: number) => {
    setNewClient({
      ...newClient,
      recurringSchedules: newClient.recurringSchedules.filter((_, i) => i !== index)
    });
  };

  const updateRecurringSchedule = (index: number, field: keyof RecurringSchedule, value: any) => {
    const updated = [...newClient.recurringSchedules];
    updated[index] = { ...updated[index], [field]: value };
    setNewClient({ ...newClient, recurringSchedules: updated });
  };

  const handleDeleteClient = async (id: string) => {
    if (!window.confirm('この利用者を削除してもよろしいですか？')) return;
    try {
      await deleteDoc(doc(db, 'clients', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `clients/${id}`);
    }
  };

  const sortedClients = React.useMemo(() => {
    const list = [...clients];
    // Filter first
    const filtered = list.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.furigana && c.furigana.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.address && c.address.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (sortBy === 'kana') {
      return filtered.sort((a, b) => {
        const fa = a.furigana || a.name || '';
        const fb = b.furigana || b.name || '';
        return fa.localeCompare(fb, 'ja');
      });
    } else if (sortBy === 'area') {
      return filtered.sort((a, b) => {
        const aa = a.address || '';
        const ab = b.address || '';
        return aa.localeCompare(ab, 'ja');
      });
    }
    return filtered;
  }, [clients, searchTerm, sortBy]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Users className="w-6 h-6 text-emerald-600" />
          利用者一覧
        </h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-xl transition-all active:scale-95 text-sm"
          >
            <UserPlus className="w-4 h-4" />
            利用者を追加
          </button>
        </div>
      </div>

      {/* Sort Buttons & Search Group */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="お名前、フリガナ、住所などで検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium text-slate-800 text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/50">
          <span className="text-[11px] font-black text-slate-500 px-2.5">並び替え：</span>
          <button
            onClick={() => setSortBy('kana')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all",
              sortBy === 'kana' ? "bg-white text-emerald-700 shadow-sm font-black" : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
            )}
          >
            あいうえお順
          </button>
          <button
            onClick={() => setSortBy('area')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all",
              sortBy === 'area' ? "bg-white text-emerald-700 shadow-sm font-black" : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
            )}
          >
            エリア順
          </button>
          <button
            onClick={() => setSortBy('default')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all",
              sortBy === 'default' ? "bg-white text-emerald-700 shadow-sm font-black" : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
            )}
          >
            登録順
          </button>
        </div>
      </div>

      {/* Row-by-Row Client Cards */}
      <div className="space-y-3.5 w-full">
        <AnimatePresence mode="popLayout">
          {sortedClients.map((client) => (
            <motion.div
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              key={client.id}
              onClick={() => onSelectClient?.(client.id)}
              className={cn(
                "bg-white p-4 sm:p-5 rounded-2xl shadow-xs border border-slate-100 hover:border-emerald-300 hover:shadow-md transition-all flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 md:gap-6 group relative",
                onSelectClient && "cursor-pointer"
              )}
            >
              {/* Left Column: Client Name */}
              <div className="md:w-52 shrink-0 flex flex-col justify-center min-w-0">
                {client.furigana && (
                  <span className="text-[9px] tracking-wider text-emerald-600 font-extrabold uppercase mb-0.5">
                    {client.furigana}
                  </span>
                )}
                <h3 className="text-base font-black text-slate-900 truncate flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                  {client.name} 様
                </h3>
                <span className="text-[11px] text-slate-500 font-bold mt-1">
                  {toWareki(client.birthDate)} ({client.age}歳) • {client.gender === 'male' ? '男性' : client.gender === 'female' ? '女性' : 'その他'}
                </span>
              </div>

              {/* Middle Section: Info & Notes */}
              <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Address & Note Column */}
                <div className="space-y-1.5 flex flex-col justify-center">
                  {client.address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-start gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 transition-colors group/link leading-relaxed"
                    >
                      <MapPin className="w-3.5 h-3.5 mt-0.5 text-emerald-400 group-hover/link:text-emerald-600 shrink-0" />
                      <span className="underline underline-offset-2 truncate" title={client.address}>
                        {client.address}
                      </span>
                    </a>
                  )}
                  {client.notes && (
                    <div className="flex items-start gap-1.5 text-xs text-slate-600 leading-relaxed">
                      <FileText className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
                      <span className="line-clamp-2" title={client.notes}>{client.notes}</span>
                    </div>
                  )}
                </div>

                {/* Recurring Schedule Column */}
                <div className="flex flex-col justify-center">
                  {client.recurringSchedules && client.recurringSchedules.length > 0 ? (
                    <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl space-y-1 max-h-[85px] overflow-y-auto">
                      <p className="text-[9px] font-black tracking-wider text-slate-400 uppercase flex items-center gap-1 border-b border-slate-100 pb-1">
                        <Clock className="w-2.5 h-2.5 text-emerald-500" />
                        定期巡回
                      </p>
                      <div className="flex flex-col gap-0.5">
                        {client.recurringSchedules.map((sched, idx) => {
                          const days = sched.daysOfWeek.map(d => DAYS_JP[d] || '').join('・');
                          const freqText = sched.frequency === 'weekly' ? '毎週' : sched.frequency === 'biweekly_even' ? '隔週(偶)' : '隔週(奇)';
                          return (
                            <div key={idx} className="text-[10px] text-slate-700 font-bold flex items-center gap-1.5 justify-between">
                              <div className="flex items-center gap-1 truncate">
                                <span className={cn(
                                  "text-[8px] font-black px-1.5 py-0.5 rounded leading-none text-center min-w-[28px]",
                                  sched.careType === '身体介護' ? "bg-sky-100 text-sky-800" : sched.careType === '生活援助' ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"
                                )}>
                                  {sched.careType === '身体介護' ? '身体' : sched.careType === '生活援助' ? '生活' : '複合'}
                                </span>
                                <span className="text-slate-500 truncate">
                                  {freqText}({days}曜)
                                </span>
                              </div>
                              <span className="text-slate-800 font-mono tracking-tighter shrink-0 font-extrabold">
                                {sched.startTime}-{sched.endTime}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-400 text-[11px] flex items-center gap-1.5 justify-center py-2.5 border border-dashed border-slate-200 rounded-xl bg-slate-50/20">
                      <Clock className="w-3.5 h-3.5 text-slate-300" />
                      スケジュール未登録
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Actions */}
              <div className="flex flex-row md:flex-col items-center justify-end w-full md:w-auto gap-2 shrink-0 bg-slate-100/60 md:bg-transparent -mx-4 -mb-4 p-3 md:p-0 md:m-0 rounded-b-2xl md:rounded-none border-t border-slate-100 md:border-t-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingClient(client);
                    setIsAdding(true);
                  }}
                  className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 px-3 py-2 rounded-xl transition-all"
                >
                  <Edit2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
                  編集
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClientClick(client.id);
                  }}
                  className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-xl transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-500" />
                  削除
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

       {/* Custom Dialog: Confirm Dummy Seeding Seeding */}
       <AnimatePresence>
         {showConfirmSeed && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-sm">
             <motion.div
               initial={{ scale: 0.95, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.95, opacity: 0 }}
               className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4"
             >
               <div className="flex items-center gap-3 text-amber-600">
                 <div className="p-3 bg-amber-50 rounded-2xl">
                   <Sparkles className="w-6 h-6 animate-pulse" />
                 </div>
                 <div>
                   <h3 className="text-lg font-bold text-slate-900">デモデータの一括登録・復元</h3>
                   <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Bulk Seeding Process</p>
                 </div>
               </div>
               <p className="text-sm text-slate-600 leading-relaxed">
                 デモ用のダミー高齢者利用者データ<strong>60名</strong>を一括登録・復元します。
                 <br /><br />
                 ※既存のデモスケジュール、ケア記録なども一括クリーンアップ＆セットアップされます。よろしいですか？
               </p>
               <div className="flex gap-3 pt-2">
                 <button
                   onClick={() => setShowConfirmSeed(false)}
                   className="flex-1 py-2.5 px-4 rounded-xl border border-slate-100 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                 >
                   キャンセル
                 </button>
                 <button
                   onClick={handleRegisterDummyClients}
                   className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white transition-colors"
                 >
                   登録する
                 </button>
               </div>
             </motion.div>
           </div>
         )}
       </AnimatePresence>

       {/* Custom Dialog: Seeding Progress Screen */}
       <AnimatePresence>
         {isSeeding && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
             <motion.div
               initial={{ scale: 0.95, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-slate-100 text-center space-y-4"
             >
               <div className="flex justify-center">
                 <div className="relative">
                   <div className="w-16 h-16 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin"></div>
                   <Sparkles className="w-6 h-6 text-amber-500 absolute inset-0 m-auto animate-pulse" />
                 </div>
               </div>
               <div className="space-y-1">
                 <h3 className="text-lg font-bold text-slate-900">データ構築中...</h3>
                 <p className="text-xs text-slate-400">Please wait while database is being built</p>
               </div>
               <p className="text-sm text-slate-500 leading-relaxed">
                 データベースのインクワイア情報、ケア実績、および巡回日程を一括生成しています。完了するまでブラウザを閉じずにお待ちください。
               </p>
             </motion.div>
           </div>
         )}
       </AnimatePresence>

       {/* Custom Dialog: Success screen */}
       <AnimatePresence>
         {showSuccessModal && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
             <motion.div
               initial={{ scale: 0.95, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.95, opacity: 0 }}
               className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4"
             >
               <div className="flex items-center gap-3 text-emerald-600">
                 <div className="p-3 bg-emerald-50 rounded-2xl">
                   <Sparkles className="w-6 h-6" />
                 </div>
                 <div>
                   <h3 className="text-lg font-bold text-slate-900">セットアップ完了</h3>
                   <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Operation Succeeded</p>
                 </div>
               </div>
               <p className="text-sm text-slate-600 leading-relaxed">
                 🎉 <strong>デモ用ダミーデータ（60名）</strong>の登録・復元が完了しました！
                 <br /><br />
                 スタッフアカウント（常勤・非常勤）、デモ用ケア目標計画、過去の履歴ケア実績、並びに本日の予定スケジュールが完全に構築されました。
               </p>
               <div className="pt-2">
                 <button
                   onClick={() => setShowSuccessModal(false)}
                   className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white rounded-xl transition-colors"
                 >
                   閉じる
                 </button>
               </div>
             </motion.div>
           </div>
         )}
       </AnimatePresence>

       {/* Custom Dialog: Error Messages */}
       <AnimatePresence>
         {errorMessage && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
             <motion.div
               initial={{ scale: 0.95, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.95, opacity: 0 }}
               className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4"
             >
               <div className="flex items-center gap-3 text-red-600">
                 <div className="p-3 bg-red-50 rounded-2xl">
                   <X className="w-6 h-6" />
                 </div>
                 <div>
                   <h3 className="text-lg font-bold text-slate-900">エラーが発生しました</h3>
                   <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Error Occurred</p>
                 </div>
               </div>
               <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 font-mono break-all text-left leading-relaxed">
                 {errorMessage}
               </p>
               <div className="pt-2">
                 <button
                   onClick={() => setErrorMessage(null)}
                   className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-sm font-semibold text-white rounded-xl transition-colors"
                 >
                   閉じる
                 </button>
               </div>
             </motion.div>
           </div>
         )}
       </AnimatePresence>

       {/* Custom Dialog: Delete Client Confirmation */}
       <AnimatePresence>
         {deletingClientId && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-sm">
             <motion.div
               initial={{ scale: 0.95, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.95, opacity: 0 }}
               className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4"
             >
               <div className="flex items-center gap-3 text-red-600">
                 <div className="p-3 bg-red-50 rounded-2xl">
                   <Trash className="w-6 h-6" />
                 </div>
                 <div>
                   <h3 className="text-lg font-bold text-slate-900">利用者の削除確認</h3>
                   <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Delete Client Confirmation</p>
                 </div>
               </div>
               <p className="text-sm text-slate-600 leading-relaxed">
                 この利用者をデータベースから完全に削除してもよろしいですか？この操作は取り消せません。
               </p>
               <div className="flex gap-3 pt-2">
                 <button
                   onClick={() => setDeletingClientId(null)}
                   className="flex-1 py-2.5 px-4 rounded-xl border border-slate-100 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                 >
                   キャンセル
                 </button>
                 <button
                   onClick={confirmDeleteClient}
                   className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-semibold text-white transition-colors"
                 >
                   削除する
                 </button>
               </div>
             </motion.div>
           </div>
         )}
       </AnimatePresence>
      </div>

      {/* Add/Edit Client Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-900">
                  {editingClient ? '利用者の情報編集' : '利用者の新規登録'}
                </h2>
                <button 
                  onClick={() => {
                    setIsAdding(false);
                    setEditingClient(null);
                  }} 
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAddClient} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">お名前 *</label>
                    <input
                      required
                      type="text"
                      value={newClient.name}
                      onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">フリガナ</label>
                    <input
                      type="text"
                      value={newClient.furigana}
                      onChange={(e) => setNewClient({ ...newClient, furigana: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">生年月日 (和暦) *</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <select
                      value={currentWareki.era}
                      onChange={(e) => handleWarekiUpdate('era', e.target.value)}
                      className="px-2 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    >
                      {ERAS.map(era => (
                        <option key={era.name} value={era.name}>{era.name}</option>
                      ))}
                    </select>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={currentWareki.year}
                        onChange={(e) => handleWarekiUpdate('year', parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm pr-6"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">年</span>
                    </div>
                    <div className="relative">
                      <select
                        value={currentWareki.month}
                        onChange={(e) => handleWarekiUpdate('month', parseInt(e.target.value))}
                        className="w-full px-2 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm appearance-none"
                      >
                        {Array.from({ length: 12 }, (_, i) => (
                          <option key={i + 1} value={i + 1}>{i + 1}</option>
                        ))}
                      </select>
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">月</span>
                    </div>
                    <div className="relative">
                      <select
                        value={currentWareki.day}
                        onChange={(e) => handleWarekiUpdate('day', parseInt(e.target.value))}
                        className="w-full px-2 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm appearance-none"
                      >
                        {Array.from({ length: 31 }, (_, i) => (
                          <option key={i + 1} value={i + 1}>{i + 1}</option>
                        ))}
                      </select>
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">日</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">西暦: {newClient.birthDate || '未設定'}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">性別</label>
                    <select
                      value={newClient.gender}
                      onChange={(e) => setNewClient({ ...newClient, gender: e.target.value as 'male' | 'female' | 'other' })}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      <option value="male">男性</option>
                      <option value="female">女性</option>
                      <option value="other">その他</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">住所</label>
                  <input
                    type="text"
                    value={newClient.address}
                    onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                
                {/* Recurring Schedules */}
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-600" />
                      定期訪問スケジュール
                    </label>
                    <button
                      type="button"
                      onClick={addRecurringSchedule}
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      追加
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    {newClient.recurringSchedules.map((schedule, index) => (
                      <div key={index} className="p-4 bg-slate-50 rounded-2xl space-y-4 relative">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">スケジュール {index + 1}</span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => duplicateRecurringSchedule(index)}
                              className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              複製
                            </button>
                            <button
                              type="button"
                              onClick={() => removeRecurringSchedule(index)}
                              className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                            >
                              <Trash className="w-3 h-3" />
                              削除
                            </button>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">曜日</label>
                          <div className="flex flex-wrap gap-1">
                            {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => {
                              const isActive = schedule.daysOfWeek.includes(i);
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => {
                                    const newDays = isActive
                                      ? schedule.daysOfWeek.filter(d => d !== i)
                                      : [...schedule.daysOfWeek, i].sort();
                                    updateRecurringSchedule(index, 'daysOfWeek', newDays);
                                  }}
                                  className={cn(
                                    "w-8 h-8 rounded-lg text-xs font-bold transition-all",
                                    isActive 
                                      ? "bg-emerald-600 text-white shadow-sm" 
                                      : "bg-white border border-slate-200 text-slate-400 hover:border-emerald-200 hover:text-emerald-600"
                                  )}
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">頻度</label>
                            <select
                              value={schedule.frequency}
                              onChange={(e) => updateRecurringSchedule(index, 'frequency', e.target.value)}
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                            >
                              <option value="weekly">毎週</option>
                              <option value="biweekly_even">隔週 (偶数週)</option>
                              <option value="biweekly_odd">隔週 (奇数週)</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">ケア区分</label>
                            <select
                              value={schedule.careType}
                              onChange={(e) => updateRecurringSchedule(index, 'careType', e.target.value)}
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                            >
                              <option value="身体介護">身体介護</option>
                              <option value="生活援助">生活援助</option>
                              <option value="身体・生活">身体・生活</option>
                              <option value="その他">その他</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">開始時間</label>
                            <input
                              type="time"
                              value={schedule.startTime}
                              onChange={(e) => updateRecurringSchedule(index, 'startTime', e.target.value)}
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">終了時間</label>
                            <input
                              type="time"
                              value={schedule.endTime}
                              onChange={(e) => updateRecurringSchedule(index, 'endTime', e.target.value)}
                              className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    {newClient.recurringSchedules.length === 0 && (
                      <p className="text-center py-4 text-slate-400 text-xs italic">
                        定期スケジュールが設定されていません
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">特記事項</label>
                  <textarea
                    rows={3}
                    value={newClient.notes}
                    onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAdding(false);
                      setEditingClient(null);
                    }}
                    className="flex-1 py-3 px-4 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 px-4 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100"
                  >
                    {editingClient ? '更新する' : '登録する'}
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
