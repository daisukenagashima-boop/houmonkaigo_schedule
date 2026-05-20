import React, { useState, useEffect } from 'react';
import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  where,
  deleteDoc,
  doc,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthGuard';
import { CareRecord, Client } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore';
import { seedSampleRecords } from '../lib/seedData';
import { 
  Calendar, 
  Clock, 
  User, 
  Trash2, 
  Search, 
  Filter,
  ChevronDown,
  ChevronUp,
  Thermometer,
  Activity,
  Utensils,
  Droplets,
  CheckCircle2,
  MapPin,
  Database,
  Loader2
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export default function RecordHistory() {
  const { user } = useAuth();
  const [records, setRecords] = useState<CareRecord[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [viewMode, setViewMode] = useState<'daily' | 'client'>('daily');
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  const [isSeeding, setIsSeeding] = useState(false);

  const PAGE_SIZE = 10;

  const fetchRecords = async (isNextPage = false) => {
    if (!user) return;
    if (isNextPage) setLoadingMore(true);
    else setLoading(true);

    try {
      let q = query(
        collection(db, 'records'),
        orderBy('date', 'desc'),
        orderBy('startTime', 'desc'),
        limit(PAGE_SIZE)
      );

      if (viewMode === 'client' && selectedClientId !== 'all') {
        q = query(
          collection(db, 'records'),
          where('clientId', '==', selectedClientId),
          orderBy('date', 'desc'),
          orderBy('startTime', 'desc'),
          limit(PAGE_SIZE)
        );
      }

      if (isNextPage && lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const snapshot = await getDocs(q);
      const newRecords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CareRecord));
      
      if (isNextPage) {
        setRecords(prev => [...prev, ...newRecords]);
      } else {
        setRecords(newRecords);
      }

      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'records');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [user, viewMode, selectedClientId]);

  useEffect(() => {
    const unsubscribeClients = onSnapshot(
      collection(db, 'clients'),
      (snapshot) => {
        setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'clients')
    );

    return () => unsubscribeClients();
  }, []);

  const handleSeedData = async () => {
    if (!user || !window.confirm('サンプルデータを生成しますか？（過去10日分）')) return;
    setIsSeeding(true);
    try {
      await seedSampleRecords(user.uid);
      fetchRecords();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'データの生成に失敗しました');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('この記録を削除してもよろしいですか？')) return;
    try {
      await deleteDoc(doc(db, 'records', id));
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `records/${id}`);
    }
  };

  const groupedRecords = React.useMemo(() => {
    const groups: { [key: string]: CareRecord[] } = {};
    records.forEach(record => {
      const key = viewMode === 'daily' ? record.date : record.clientId;
      if (!groups[key]) groups[key] = [];
      groups[key].push(record);
    });
    return groups;
  }, [records, viewMode]);

  const sortedGroupKeys = Object.keys(groupedRecords).sort((a, b) => {
    if (viewMode === 'daily') return b.localeCompare(a);
    const clientA = clients.find(c => c.id === a)?.name || '';
    const clientB = clients.find(c => c.id === b)?.name || '';
    return clientA.localeCompare(clientB);
  });

  const getCheckedActivities = (record: CareRecord) => {
    const activities: string[] = [];
    
    // Physical Care
    if (record.physicalCare?.hygiene?.wipingFull) activities.push('清拭(全身)');
    if (record.physicalCare?.hygiene?.wipingPartial) activities.push('清拭(部分)');
    if (record.physicalCare?.hygiene?.bathing) activities.push('全身浴');
    if (record.physicalCare?.hygiene?.hairWash) activities.push('洗髪');
    if (record.physicalCare?.hygiene?.oralCare) activities.push('口腔ケア');
    
    if (record.physicalCare?.movement?.positioning) activities.push('体位変換');
    if (record.physicalCare?.movement?.transfer) activities.push('移乗介助');
    if (record.physicalCare?.movement?.dressing) activities.push('更衣介助');
    
    // Life Support
    if (record.lifeSupport?.cleaning?.room) activities.push('掃除(居室)');
    if (record.lifeSupport?.cleaning?.toilet) activities.push('掃除(トイレ)');
    if (record.lifeSupport?.cleaning?.kitchen) activities.push('掃除(台所)');
    if (record.lifeSupport?.cleaning?.bath) activities.push('掃除(浴室)');
    if (record.lifeSupport?.cleaning?.pToilet) activities.push('掃除(Pトイレ)');
    if (record.lifeSupport?.cleaning?.garbage) activities.push('ゴミ出し');
    
    if (record.lifeSupport?.laundry?.wash) activities.push('洗濯');
    if (record.lifeSupport?.laundry?.dry) activities.push('乾燥');
    if (record.lifeSupport?.laundry?.storage) activities.push('収納');
    if (record.lifeSupport?.laundry?.ironing) activities.push('アイロン');
    
    if (record.lifeSupport?.cooking?.prep) activities.push('下拵え');
    if (record.lifeSupport?.cooking?.cook) activities.push('調理');
    if (record.lifeSupport?.cooking?.serving) activities.push('配膳・下膳');
    
    if (record.lifeSupport?.shopping?.daily) activities.push('買い物(日用品)');
    if (record.lifeSupport?.shopping?.medicine) activities.push('薬の受取り');
    
    // Other Services
    if (record.otherServices?.medication?.support) activities.push('服薬介助');
    if (record.otherServices?.medication?.application) activities.push('薬の塗布');
    if (record.otherServices?.medication?.eyeDrops) activities.push('点眼');
    
    if (record.otherServices?.medical?.suction) activities.push('痰の吸引');
    if (record.otherServices?.medical?.enema) activities.push('浣腸');
    if (record.otherServices?.medical?.prepCleanup) activities.push('医療準備');
    
    if (record.otherServices?.selfReliance?.housework) activities.push('共に行う家事');
    if (record.otherServices?.selfReliance?.dementiaCare) activities.push('認知症ケア');
    if (record.otherServices?.selfReliance?.fallPrevention) activities.push('転倒予防');

    return activities;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-emerald-600" />
            記録履歴
          </h1>
          <p className="text-sm text-slate-500">
            {viewMode === 'daily' ? '日次表示' : '利用者別表示'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-slate-100 p-1 rounded-xl flex">
            <button
              onClick={() => setViewMode('daily')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                viewMode === 'daily' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              日次
            </button>
            <button
              onClick={() => setViewMode('client')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                viewMode === 'client' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              利用者別
            </button>
          </div>

          {viewMode === 'client' && (
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">すべての利用者</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          <button
            onClick={handleSeedData}
            disabled={isSeeding}
            className="flex items-center gap-2 px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50"
          >
            {isSeeding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3" />}
            サンプルデータ生成
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sortedGroupKeys.length > 0 ? (
          <div className="space-y-12">
            {sortedGroupKeys.map((groupKey) => (
              <div key={groupKey} className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-px flex-1 bg-slate-100" />
                  <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] bg-slate-50 px-4 py-1 rounded-full border border-slate-100">
                    {viewMode === 'daily' 
                      ? format(parseISO(groupKey), 'yyyy年MM月dd日 (E)', { locale: ja })
                      : (clients.find(c => c.id === groupKey)?.name || '不明な利用者') + ' 様'}
                  </h2>
                  <div className="h-px flex-1 bg-slate-100" />
                </div>

                <div className="space-y-4">
                  {groupedRecords[groupKey].map((record) => (
                    <div
                      key={record.id}
                      className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden transition-all hover:shadow-md"
                    >
                      <div
                        onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
                        className="p-4 md:p-6 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 md:gap-4 min-w-0">
                          <div className="min-w-0">
                            <h3 className="font-bold text-slate-900 truncate">
                              {clients.find(c => c.id === record.clientId)?.name || '不明な利用者'} 様
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                              <span className="flex items-center gap-1 whitespace-nowrap">
                                <Calendar className="w-3 h-3" />
                                {record.date}
                              </span>
                              <span className="flex items-center gap-1 whitespace-nowrap">
                                <Clock className="w-3 h-3" />
                                {record.startTime} - {record.endTime}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0">
                          <div className="flex items-center gap-2">
                            {record.vitalSigns?.temperature && (
                              <span className="px-2 py-1 bg-red-50 text-red-600 text-[10px] md:text-xs font-bold rounded-lg whitespace-nowrap">
                                {record.vitalSigns.temperature}℃
                              </span>
                            )}
                            {getCheckedActivities(record).length > 0 && (
                              <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[10px] md:text-xs font-bold rounded-lg whitespace-nowrap">
                                {getCheckedActivities(record).length}件の実施
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 ml-auto sm:ml-0">
                            <button
                              onClick={(e) => handleDelete(e, record.id)}
                              className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            {expandedId === record.id ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                          </div>
                        </div>
                      </div>

                      <AnimatePresence>
                        {expandedId === record.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-slate-50 bg-slate-50/50"
                          >
                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                              {/* Vitals & Activities */}
                              <div className="space-y-6">
                                {clients.find(c => c.id === record.clientId)?.address && (
                                  <div className="space-y-3">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                      <MapPin className="w-3 h-3" /> 訪問先住所
                                    </h4>
                                    <a
                                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clients.find(c => c.id === record.clientId)!.address!)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block bg-white p-3 rounded-2xl border border-slate-100 text-sm text-emerald-600 hover:text-emerald-700 transition-colors underline underline-offset-2"
                                    >
                                      {clients.find(c => c.id === record.clientId)?.address}
                                    </a>
                                  </div>
                                )}
                                <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                    <Thermometer className="w-3 h-3" /> バイタル
                                  </h4>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white p-3 rounded-2xl border border-slate-100">
                                      <p className="text-xs text-slate-500">体温</p>
                                      <p className="font-bold text-slate-900">{record.vitalSigns?.temperature || '-'} ℃</p>
                                    </div>
                                    <div className="bg-white p-3 rounded-2xl border border-slate-100">
                                      <p className="text-xs text-slate-500">血圧</p>
                                      <p className="font-bold text-slate-900">
                                        {record.vitalSigns?.bloodPressureHigh || '-'}/{record.vitalSigns?.bloodPressureLow || '-'}
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                    <CheckCircle2 className="w-3 h-3" /> 実施内容
                                  </h4>
                                  <div className="flex flex-wrap gap-2">
                                    {getCheckedActivities(record).map(a => (
                                      <span key={a} className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-600">
                                        {a}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {/* Meal & Notes */}
                              <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-3">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                      <Utensils className="w-3 h-3" /> 食事
                                    </h4>
                                    <div className="bg-white p-3 rounded-2xl border border-slate-100">
                                      <p className="text-xs text-slate-500">主食</p>
                                      <p className="font-bold text-slate-900">{record.mealInfo?.mainDish || 0}%</p>
                                    </div>
                                  </div>
                                  <div className="space-y-3">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                      <Droplets className="w-3 h-3" /> 排泄
                                    </h4>
                                    <div className="bg-white p-3 rounded-2xl border border-slate-100">
                                      <p className="text-xs text-slate-500">尿/便</p>
                                      <p className="font-bold text-slate-900">
                                        {record.excretionInfo?.urinationCount || 0}回 / {record.excretionInfo?.defecationCount || 0}回
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-3">
                                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">特記事項</h4>
                                  <div className="bg-white p-4 rounded-2xl border border-slate-100 text-sm text-slate-700 whitespace-pre-wrap">
                                    {record.generalNotes || '特になし'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {hasMore && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={() => fetchRecords(true)}
                  disabled={loadingMore}
                  className="px-8 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm"
                >
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  さらに読み込む
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
            記録が見つかりませんでした
          </div>
        )}
      </div>
    </div>
  );
}
