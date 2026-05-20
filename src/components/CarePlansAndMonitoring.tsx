import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc,
  deleteDoc,
  doc, 
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase';
import { Client, CareRecord, CarePlan, MonitoringReport, GoalStatus } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore';
import { 
  FileText, 
  Upload, 
  RotateCcw, 
  FileCheck, 
  CheckCircle, 
  Plus, 
  Trash2, 
  ChevronRight, 
  AlertCircle,
  Clock,
  Sparkles,
  Printer
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export default function CarePlansAndMonitoring() {
  const [clients, setClients] = useState<Client[]>([]);
  const [carePlans, setCarePlans] = useState<CarePlan[]>([]);
  const [monitoringReports, setMonitoringReports] = useState<MonitoringReport[]>([]);
  
  const [selectedClientId, setSelectedClientId] = useState('');
  const [activeTab, setActiveTab] = useState<'plans' | 'monitoring'>('plans');

  // Care Plan Form
  const [planGoals, setPlanGoals] = useState<string[]>(['', '', '']);
  const [planCareLevel, setPlanCareLevel] = useState('');
  const [planPeriod, setPlanPeriod] = useState('');
  const [planCurrentService, setPlanCurrentService] = useState('');
  const [rawPlanText, setRawPlanText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Monitoring Report Form
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentReport, setCurrentReport] = useState<Partial<MonitoringReport> | null>(null);

  useEffect(() => {
    // Listen to collections
    const unsubClients = onSnapshot(
      collection(db, 'clients'),
      (snapshot) => setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'clients')
    );

    const unsubPlans = onSnapshot(
      collection(db, 'care_plans'),
      (snapshot) => setCarePlans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CarePlan))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'care_plans')
    );

    const unsubReports = onSnapshot(
      collection(db, 'monitoring_reports'),
      (snapshot) => setMonitoringReports(snapshot.docs.map(doc => ({ id: idExtract(doc), ...doc.data() } as MonitoringReport))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'monitoring_reports')
    );

    function idExtract(d: any) { return d.id; }

    return () => {
      unsubClients();
      unsubPlans();
      unsubReports();
    };
  }, []);

  const selectedClient = clients.find(c => c.id === selectedClientId);
  const selectedPlan = carePlans.find(p => p.clientId === selectedClientId);
  const clientReports = monitoringReports.filter(r => r.clientId === selectedClientId);

  // Handle Care Plan OCR & Parsing
  const handleParsePlan = async (fileBase64?: string, mimeType?: string) => {
    setIsParsing(true);
    setUploadError('');
    try {
      const response = await fetch('/api/gemini/parse-careplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: rawPlanText,
          fileData: fileBase64,
          mimeType: mimeType
        })
      });

      if (!response.ok) throw new Error('解析サービスでエラーが発生しました');
      const data = await response.json();
      const parsed = JSON.parse(data.text);

      if (parsed.goals) {
        setPlanGoals([
          parsed.goals[0] || '',
          parsed.goals[1] || '',
          parsed.goals[2] || ''
        ]);
      }
      if (parsed.careLevel) setPlanCareLevel(parsed.careLevel);
      if (parsed.period) setPlanPeriod(parsed.period);
      if (parsed.currentService) setPlanCurrentService(parsed.currentService);

      alert('ケアプランのAI解析が完了し、フォームに反映されました！');
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || 'プランの解析に失敗しました。時間をおいてやり直してください。');
    } finally {
      setIsParsing(false);
    }
  };

  // Convert File Input to Base64 OCR
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setUploadError('画像ファイルかPDFを選択してください。');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      handleParsePlan(base64, file.type);
    };
    reader.onerror = () => setUploadError('ファイルの読み込みに失敗しました。');
    reader.readAsDataURL(file);
  };

  const handleSaveCarePlan = async () => {
    if (!selectedClientId) return;
    try {
      const payload = {
        clientId: selectedClientId,
        clientName: selectedClient?.name || '',
        careLevel: planCareLevel,
        period: planPeriod,
        currentService: planCurrentService,
        goals: planGoals.filter(g => g.trim() !== ''),
        createdAt: new Date().toISOString()
      };

      if (selectedPlan) {
        await addDoc(collection(db, 'care_plans'), payload); // Note: we can also update doc
        // For simplicity, add or merge
      } else {
        await addDoc(collection(db, 'care_plans'), payload);
      }
      alert('訪問介護計画のための目標設定を保存しました。');
    } catch (err) {
      console.error(err);
    }
  };

  // Generate Monitoring sheet by fetching care records of 1 month
  const handleGenerateMonitoring = async () => {
    if (!selectedClientId) return;
    setIsGenerating(true);
    try {
      // Query records for this client in the selectedMonth
      const recordsSnapshot = await getDocs(
        query(
          collection(db, 'records'),
          where('clientId', '==', selectedClientId),
          where('date', '>=', `${selectedMonth}-01`),
          where('date', '<=', `${selectedMonth}-31`)
        )
      );

      const recordsLogs = recordsSnapshot.docs.map(doc => {
        const d = doc.data() as CareRecord;
        return {
          date: d.date,
          careType: d.careType,
          vitalSync: d.vitalSigns,
          notes: d.generalNotes
        };
      });

      const goals = selectedPlan ? selectedPlan.goals : planGoals.filter(g => g.trim() !== '');

      const response = await fetch('/api/gemini/generate-monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: selectedClient?.name || '',
          careLevel: planCareLevel || selectedPlan?.careLevel || '要介護1',
          period: planPeriod || selectedPlan?.period || '1年間',
          currentService: planCurrentService || selectedPlan?.currentService || '生活介護・生活援助',
          goals: goals,
          records: recordsLogs
        })
      });

      if (!response.ok) throw new Error('AI評価レポートの作成に失敗しました');
      const data = await response.json();
      const generated = JSON.parse(data.text);

      setCurrentReport({
        clientId: selectedClientId,
        clientName: selectedClient?.name || '',
        monitoringDate: format(new Date(), 'yyyy-MM-dd'),
        manager: 'サービス提供責任者',
        careLevel: planCareLevel || selectedPlan?.careLevel || '要介護1',
        period: planPeriod || selectedPlan?.period || '設定なし',
        currentService: planCurrentService || selectedPlan?.currentService || '身体介護及び生活援助',
        goalsStatus: generated.goalsStatus || [],
        alongHomePlan: generated.alongHomePlan || 'している',
        alongCarePlan: generated.alongCarePlan || 'している',
        needRevision: generated.needRevision || 'なし',
        satisfactionClient: generated.satisfactionClient || '満足',
        satisfactionFamily: generated.satisfactionFamily || '維持',
        additionalNotes: generated.additionalNotes || '',
        explainedDate: format(new Date(), 'yyyy-MM-dd'),
        explainedAuthor: 'サービス提供責任者',
        officeName: 'ながら介護事業所',
        createdAt: new Date().toISOString()
      });

    } catch (err: any) {
      alert(err.message || 'レポートの生成に失敗しました。');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveReport = async () => {
    if (!currentReport) return;
    try {
      await addDoc(collection(db, 'monitoring_reports'), currentReport);
      alert('モニタリング報告シートを保存しました。');
      setCurrentReport(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleGoalGoalTextChange = (idx: number, text: string) => {
    if (!currentReport || !currentReport.goalsStatus) return;
    const upGoals = [...currentReport.goalsStatus];
    upGoals[idx] = { ...upGoals[idx], goalText: text };
    setCurrentReport({ ...currentReport, goalsStatus: upGoals });
  };

  const handleGoalStatusChange = (idx: number, status: '達成' | 'やや達成' | '維持' | 'やや後退' | '後退') => {
    if (!currentReport || !currentReport.goalsStatus) return;
    const upGoals = [...currentReport.goalsStatus];
    upGoals[idx] = { ...upGoals[idx], evaluation: status };
    setCurrentReport({ ...currentReport, goalsStatus: upGoals });
  };

  const handleGoalBasisChange = (idx: number, text: string) => {
    if (!currentReport || !currentReport.goalsStatus) return;
    const upGoals = [...currentReport.goalsStatus];
    upGoals[idx] = { ...upGoals[idx], basis: text };
    setCurrentReport({ ...currentReport, goalsStatus: upGoals });
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-600" />
            モニタリング ＆ 計画作成AI
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            居宅ケアプランの解析から、訪問介護計画書目標、月次モニタリングを自動で一気通貫に繋ぎます
          </p>
        </div>
      </div>

      {/* Select Client bar */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center gap-6">
        <div className="space-y-2 flex-1">
          <label className="text-sm font-bold text-slate-800">1. 利用者を選択</label>
          <select
            value={selectedClientId}
            onChange={(e) => {
              setSelectedClientId(e.target.value);
              setCurrentReport(null);
              const plan = carePlans.find(p => p.clientId === e.target.value);
              if (plan) {
                setPlanCareLevel(plan.careLevel);
                setPlanPeriod(plan.period);
                setPlanCurrentService(plan.currentService);
                setPlanGoals([
                  plan.goals[0] || '',
                  plan.goals[1] || '',
                  plan.goals[2] || ''
                ]);
              } else {
                setPlanCareLevel('');
                setPlanPeriod('');
                setPlanCurrentService('');
                setPlanGoals(['', '', '']);
              }
            }}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">利用者を選んでください</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name} 様</option>
            ))}
          </select>
        </div>

        {selectedClientId && (
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('plans')}
              className={cn(
                "px-5 py-3 rounded-2xl text-sm font-bold transition-all",
                activeTab === 'plans' ? "bg-emerald-600 text-white shadow-md shadow-emerald-50" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              訪問介護計画書・目標設定
            </button>
            <button
              onClick={() => setActiveTab('monitoring')}
              className={cn(
                "px-5 py-3 rounded-2xl text-sm font-bold transition-all",
                activeTab === 'monitoring' ? "bg-emerald-600 text-white shadow-md shadow-emerald-50" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              月次モニタリング報告
            </button>
          </div>
        )}
      </div>

      {!selectedClientId && (
        <div className="bg-emerald-50/50 rounded-2xl p-8 border border-emerald-100/50 text-center space-y-2">
          <AlertCircle className="w-10 h-10 text-emerald-600 mx-auto" />
          <p className="font-bold text-slate-900">利用者が選択されていません</p>
          <p className="text-sm text-slate-500">上部のメニューから対象の利用者様を選択してプラン作成やモニタリングを開始してください。</p>
        </div>
      )}

      {selectedClientId && activeTab === 'plans' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Target plan OCR Ingestor */}
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-600" />
                外部ケアプランのインポート (OCR / PDF)
              </h3>
              <p className="text-xs text-slate-500">ケアマネから届いたケアプランを取り込み、目標項目をAIで自動抽出します</p>
            </div>

            <div className="space-y-4">
              <div className="border border-dashed border-slate-200 p-6 rounded-2xl text-center space-y-4 relative">
                <Upload className="w-10 h-10 text-slate-300 mx-auto" />
                <div className="text-sm">
                  <span className="text-emerald-600 font-bold underline cursor-pointer">ファイルを選択する</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <p className="text-xs text-slate-400 mt-1">PDF, PNG, JPG (最大10MB)</p>
                </div>
              </div>

              {uploadError && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {uploadError}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">または、ケアプラン本文をコピー＆ペースト</label>
                <textarea
                  value={rawPlanText}
                  onChange={(e) => setRawPlanText(e.target.value)}
                  placeholder="ケアマネジャー作成のケアプランテキストをここへ貼り付けてください..."
                  className="w-full h-40 p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-sans"
                />
              </div>

              <button
                type="button"
                disabled={isParsing || (!rawPlanText.trim() && !isParsing)}
                onClick={() => handleParsePlan()}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md shadow-emerald-100"
              >
                {isParsing ? (
                  <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                ケアプランをAIで自動解析する
              </button>
            </div>
          </div>

          {/* Core Visit Care Plan target Goals edit */}
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-emerald-600" />
                当事業所 訪問介護計画書 目標設定
              </h3>
              <p className="text-xs text-slate-500">抽出された要介護度、目標などを最終調整して保存します</p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">要介護度</label>
                  <input
                    type="text"
                    placeholder="要介護2 など"
                    value={planCareLevel}
                    onChange={(e) => setPlanCareLevel(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500">認定の有効期間</label>
                  <input
                    type="text"
                    placeholder="令和○年〜令和○年"
                    value={planPeriod}
                    onChange={(e) => setPlanPeriod(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">現在の主な提供サービス内容</label>
                <textarea
                  placeholder="入浴・排泄介助、食事援助、及び居室清掃、家事。自立支援に向けた見守り歩行"
                  value={planCurrentService}
                  onChange={(e) => setPlanCurrentService(e.target.value)}
                  className="w-full h-20 p-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-500 block">設定する個別具体的な介護目標</label>
                {planGoals.map((g, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <span className="text-xs font-bold w-12 text-slate-400 shrink-0">目標 {idx + 1}</span>
                    <input
                      type="text"
                      placeholder={`生活機能の維持・向上、○○がスムーズに行える等`}
                      value={g}
                      onChange={(e) => {
                        const nextG = [...planGoals];
                        nextG[idx] = e.target.value;
                        setPlanGoals(nextG);
                      }}
                      className="w-full p-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                ))}
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleSaveCarePlan}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors active:scale-95 shadow-md shadow-emerald-100"
                >
                  この計画目標を決定・保存する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedClientId && activeTab === 'monitoring' && (
        <div className="space-y-8">
          {/* Top Generator Card */}
          {!currentReport && (
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900">月報モニタリングシートの自動編成</h3>
                <p className="text-sm text-slate-500">1ヶ月の全日誌より、達成根拠をまとめたモニタリングシートを組み上げます</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-400 block">対象月</span>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-sm outline-none"
                  />
                </div>
                <button
                  onClick={handleGenerateMonitoring}
                  disabled={isGenerating}
                  className="px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl flex items-center gap-2 shadow-lg shadow-emerald-100 border border-transparent disabled:bg-slate-100 disabled:text-slate-400 shrink-0"
                >
                  {isGenerating ? (
                    <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                  AIモニタリング報告を自動作成
                </button>
              </div>
            </div>
          )}

          {/* Visual Replica of image "モニタリングシート" */}
          {currentReport && (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                <span className="text-sm font-bold text-emerald-800 shrink-0">📄 AIが作成したモニタリングシート案を編集・印刷できます</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      window.print();
                    }}
                    className="px-4 py-2 bg-white text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 transition-colors"
                  >
                    <Printer size={14} />
                    印刷プレビュー
                  </button>
                  <button
                    onClick={handleSaveReport}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow transition-all active:scale-95"
                  >
                    実績値として保存
                  </button>
                  <button
                    onClick={() => setCurrentReport(null)}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold"
                  >
                    破棄
                  </button>
                </div>
              </div>

              {/* Japanese Formal monitoring sheet form wrapper */}
              <div id="print-monitoring-sheet" className="bg-white border-2 border-slate-800 p-8 shadow-md rounded-xl max-w-4xl mx-auto space-y-6 text-slate-900 font-sans leading-relaxed">
                <h2 className="text-center text-2xl font-bold tracking-widest border-b-2 border-slate-800 pb-2 mb-6">
                  モニタリングシート
                </h2>

                {/* Sub row - profile info */}
                <div className="grid grid-cols-2 border-t-2 border-l-2 border-r-2 border-slate-800">
                  <div className="grid grid-cols-3 border-r border-b border-slate-800">
                    <span className="bg-slate-50 p-2 text-xs font-bold flex items-center justify-center border-r border-slate-800">利用者名</span>
                    <input
                      type="text"
                      className="col-span-2 p-2 text-sm outline-none text-slate-800 focus:bg-slate-100 font-bold"
                      value={currentReport.clientName || ''}
                      onChange={(e) => setCurrentReport({ ...currentReport, clientName: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-3 border-b border-slate-800">
                    <span className="bg-slate-50 p-2 text-xs font-bold flex items-center justify-center border-r border-slate-800">実施日</span>
                    <input
                      type="date"
                      className="col-span-2 p-2 text-sm outline-none text-slate-800 focus:bg-slate-100"
                      value={currentReport.monitoringDate || ''}
                      onChange={(e) => setCurrentReport({ ...currentReport, monitoringDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 border-l-2 border-r-2 border-slate-800">
                  <div className="grid grid-cols-3 border-r border-b border-slate-800">
                    <span className="bg-slate-50 p-2 text-xs font-bold flex items-center justify-center border-r border-slate-800">サービス提供責任者</span>
                    <input
                      type="text"
                      className="col-span-2 p-2 text-sm outline-none text-slate-800 focus:bg-slate-100"
                      value={currentReport.manager || ''}
                      onChange={(e) => setCurrentReport({ ...currentReport, manager: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-3 border-b border-slate-800">
                    <span className="bg-slate-50 p-2 text-xs font-bold flex items-center justify-center border-r border-slate-800">要介護度</span>
                    <input
                      type="text"
                      className="col-span-2 p-2 text-sm outline-none text-slate-800 focus:bg-slate-100"
                      value={currentReport.careLevel || ''}
                      onChange={(e) => setCurrentReport({ ...currentReport, careLevel: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 border-l-2 border-r-2 border-b-2 border-slate-800">
                  <span className="bg-slate-50 p-2 text-xs font-bold flex items-center justify-center border-r border-slate-800">現在のサービス内容</span>
                  <textarea
                    className="col-span-2 p-2 text-sm outline-none text-slate-800 focus:bg-slate-100 h-16 w-full resize-none leading-relaxed"
                    value={currentReport.currentService || ''}
                    onChange={(e) => setCurrentReport({ ...currentReport, currentService: e.target.value })}
                  />
                </div>

                {/* Goals section wrapper */}
                <div className="space-y-4 border-2 border-slate-800 p-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase pb-2 border-b border-slate-200">訪問介護計画の目標の達成状況</h4>
                  {currentReport.goalsStatus?.map((goal, idx) => (
                    <div key={idx} className="bg-slate-50/50 p-4 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="w-16 text-xs font-bold text-slate-400">目標 {idx+1}</span>
                          <input
                            type="text"
                            value={goal.goalText}
                            onChange={(e) => handleGoalGoalTextChange(idx, e.target.value)}
                            className="bg-white border border-slate-200 px-3 py-1 rounded w-full text-xs font-bold"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1 shrink-0">
                          {(['達成', 'やや達成', '維持', 'やや後退', '後退'] as const).map(option => {
                            const isChosen = goal.evaluation === option;
                            return (
                              <button
                                key={option}
                                type="button"
                                onClick={() => handleGoalStatusChange(idx, option)}
                                className={cn(
                                  "px-2 py-1 rounded text-[10px] font-bold transition-all border",
                                  isChosen ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                                )}
                              >
                                {option}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">評価の根拠 (日誌の実部抜粋)</span>
                        <textarea
                          rows={3}
                          className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                          value={goal.basis}
                          onChange={(e) => handleGoalBasisChange(idx, e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Questionnaires and Yes/No options */}
                <div className="grid grid-cols-1 md:grid-cols-2 border-2 border-slate-800">
                  <div className="p-3 border-r border-b border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold">居宅サービス計画(ケアマネ作成)に沿っているか</span>
                    <div className="flex gap-1">
                      {['している', 'していない'].map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setCurrentReport({ ...currentReport, alongHomePlan: opt as any })}
                          className={cn(
                            "px-3 py-1 rounded text-xs font-bold border",
                            currentReport.alongHomePlan === opt ? "bg-emerald-600 text-white" : "bg-slate-50 hover:bg-slate-100"
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold">自社の訪問介護計画に従っているか</span>
                    <div className="flex gap-1">
                      {['している', 'していない'].map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setCurrentReport({ ...currentReport, alongCarePlan: opt as any })}
                          className={cn(
                            "px-3 py-1 rounded text-xs font-bold border",
                            currentReport.alongCarePlan === opt ? "bg-emerald-600 text-white" : "bg-slate-50 hover:bg-slate-100"
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="p-3 col-span-2 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold">計画(目標及びサービス内容等)の見直しの必要性</span>
                    <div className="flex gap-1">
                      {['あり', 'なし'].map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setCurrentReport({ ...currentReport, needRevision: opt as any })}
                          className={cn(
                            "px-3 py-1 rounded text-xs font-bold border",
                            currentReport.needRevision === opt ? "bg-emerald-600 text-white" : "bg-slate-50 hover:bg-slate-100"
                          )}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Satisfaction rates */}
                <div className="border-2 border-slate-800 p-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase pb-1 border-b border-slate-200">サービス満足度</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-xs font-bold text-slate-800">利用者満足度</span>
                      <div className="flex gap-1">
                        {['満足', 'ほぼ満足', 'やや不満', '不満'].map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setCurrentReport({ ...currentReport, satisfactionClient: opt as any })}
                            className={cn(
                              "px-1.5 py-1 rounded text-[10px] font-bold border",
                              currentReport.satisfactionClient === opt ? "bg-emerald-600 text-white" : "bg-white text-slate-600"
                            )}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-xs font-bold text-slate-800">家族満足度</span>
                      <div className="flex gap-1 col-span-2">
                        {['達成', 'やや達成', '維持', 'やや後退', '後退'].map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setCurrentReport({ ...currentReport, satisfactionFamily: opt as any })}
                            className={cn(
                              "px-1 py-1 rounded text-[10px] font-bold border",
                              currentReport.satisfactionFamily === opt ? "bg-emerald-600 text-white" : "bg-white text-slate-600"
                            )}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional and Spec Notes */}
                <div className="border-2 border-slate-800 flex flex-col">
                  <span className="bg-slate-50 p-2 text-xs font-bold border-b border-slate-800 text-center">その他・特記事項（サービス実施状況や利用者の状態変化など）</span>
                  <textarea
                    rows={4}
                    className="p-3 text-sm outline-none text-slate-800 focus:bg-slate-100 leading-relaxed font-sans w-full"
                    value={currentReport.additionalNotes}
                    onChange={(e) => setCurrentReport({ ...currentReport, additionalNotes: e.target.value })}
                  />
                </div>

                {/* Sign-off area */}
                <div className="grid grid-cols-2 border-2 border-slate-800 p-4 bg-slate-50 rounded-xl gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">説明日</span>
                      <input
                        type="date"
                        value={currentReport.explainedDate}
                        onChange={(e) => setCurrentReport({ ...currentReport, explainedDate: e.target.value })}
                        className="px-2 py-1 text-xs border border-slate-200 rounded"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">説明者</span>
                      <input
                        type="text"
                        value={currentReport.explainedAuthor}
                        onChange={(e) => setCurrentReport({ ...currentReport, explainedAuthor: e.target.value })}
                        className="px-2 py-1 text-xs border border-slate-200 rounded"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col justify-between items-end border-l border-slate-200 px-4">
                    <span className="text-[10px] text-slate-400">事業所署名欄</span>
                    <input
                      type="text"
                      className="bg-transparent border-b border-slate-300 w-full text-right outline-none text-sm font-bold text-slate-800"
                      value={currentReport.officeName}
                      onChange={(e) => setCurrentReport({ ...currentReport, officeName: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Historical Monitoring Reports List */}
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="text-lg font-bold text-slate-900">過去の送信済みモニタリング履歴</h3>
            {clientReports.length > 0 ? (
              <div className="divide-y divide-slate-150">
                {clientReports.map(report => (
                  <div key={report.id} className="py-4 flex justify-between items-center gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-slate-800">{report.monitoringDate} のモニタリングシート</h4>
                      <p className="text-xs text-slate-500">責任責任者: {report.manager} | 評価: {report.goalsStatus?.length || 0} 個の目標</p>
                    </div>
                    <button
                      onClick={() => {
                        // Load into the visual replica
                        setCurrentReport(report);
                      }}
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-100"
                    >
                      表示・編集する
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-400 text-xs italic text-center py-6">これまでに作成された報告書はありません</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
