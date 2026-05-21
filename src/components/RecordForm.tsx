import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  doc, 
  getDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthGuard';
import { 
  Client, 
  CareRecord, 
  VitalSigns, 
  MealInfo, 
  ExcretionInfo, 
  PhysicalCare, 
  LifeSupport, 
  OtherServices, 
  MoneyManagement, 
  ExitCheck 
} from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore';
import { 
  X, 
  Save, 
  Plus, 
  Minus, 
  Mic,
  Printer,
  CheckCircle2, 
  AlertCircle,
  User,
  Clock,
  Activity,
  Utensils,
  Droplets,
  Bath,
  Home,
  ShoppingBag,
  Pill,
  Stethoscope,
  Heart,
  Wallet,
  ShieldCheck,
  PenTool,
  RotateCcw,
  Calendar,
  ChevronDown,
  MapPin,
  Sparkles,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import SignatureCanvas from 'react-signature-canvas';
import { cn } from '../lib/utils';

interface RecordFormProps {
  onClose: () => void;
  onSuccess: () => void;
  initialData?: {
    clientId?: string;
    startTime?: string;
    endTime?: string;
    serviceType?: string;
    careType?: string;
    scheduleId?: string;
  };
}

const PHRASE_CHIPS: Record<string, string[]> = {
  excretion: ['パッド交換汚染なし', '排尿あり', '排便あり（普通便）', '失禁なし', 'トイレ誘導にて排泄'],
  meal: ['完食されました', '水分摂取良好', 'むせ込みなし', '自力摂取', '介助にて摂取'],
  hygiene: ['全身清拭実施', '口腔ケア実施', '洗髪実施', '入浴介助実施'],
  general: ['お変わりありません', '元気に過ごされました', '傾眠傾向あり', '活気あり'],
};

export default function RecordForm({ onClose, onSuccess, initialData }: RecordFormProps) {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(initialData?.clientId || '');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState<'physical' | 'life'>('physical');
  const [isMoneyOpen, setIsMoneyOpen] = useState(false);
  
  const [formData, setFormData] = useState<Partial<CareRecord>>({
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: initialData?.startTime || format(new Date(), 'HH:mm'),
    endTime: initialData?.endTime || format(new Date(), 'HH:mm'),
    serviceType: (initialData?.serviceType as any) || '訪問介護',
    careType: (initialData?.careType as any) || '身体介護',
    vitalSigns: {
      faceColor: 'good',
      sweating: 'none',
    },
    mealInfo: {
      mainDish: 0,
      sideDish: 0,
      fluid: 200,
      mealCare: false,
      fluidCare: false,
    },
    excretionInfo: {
      urinationCount: 0,
      urinationAmount: '',
      defecationCount: 0,
      defecationStatus: '',
      toiletCare: false,
      diaperChange: false,
      padChange: false,
      genitalCleaning: false,
    },
    physicalCare: {
      hygiene: {},
      movement: {},
    },
    lifeSupport: {
      cleaning: {},
      laundry: {},
      cooking: { menu: '' },
      shopping: {},
    },
    otherServices: {
      medication: {},
      medical: {},
      selfReliance: {},
    },
    moneyManagement: {
      deposit: 0,
      totalSpent: 0,
      change: 0,
      details: '',
    },
    exitCheck: {
      fire: false,
      electricity: false,
      water: false,
      locking: false,
    },
    generalNotes: '',
    oralConsent: false,
  });

  useEffect(() => {
    if (formData.careType === '身体介護') {
      setActiveTab('physical');
    } else if (formData.careType === '生活援助') {
      setActiveTab('life');
    }
  }, [formData.careType]);

  const sigCanvas = useRef<SignatureCanvas>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [lastSavedRecord, setLastSavedRecord] = useState<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-adjust textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [formData.generalNotes]);

  const startVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('お使いのブラウザは音声入力に対応していません。');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setFormData(prev => ({
        ...prev,
        generalNotes: prev.generalNotes ? `${prev.generalNotes}\n${transcript}` : transcript
      }));
    };

    recognition.start();
  };

  const generateAINotes = async () => {
    if (!selectedClient) return;
    setIsGeneratingAI(true);
    try {
      // Get checked activities
      const activities: string[] = [];
      const getActivities = (obj: any, prefix = '') => {
        if (!obj) return;
        Object.entries(obj).forEach(([key, value]) => {
          if (typeof value === 'boolean' && value) activities.push(prefix + key);
          else if (typeof value === 'object') getActivities(value, prefix);
        });
      };
      getActivities(formData.physicalCare, '身体介護:');
      getActivities(formData.lifeSupport, '生活援助:');
      getActivities(formData.otherServices, 'その他:');

      const prompt = `
        以下の介護記録データから、利用者様のご家族や事業所に報告するための適切な「特記事項」の文章を作成してください。
        専門的かつ温かみのある日本語で、150文字程度にまとめてください。
        
        【重要ルール】
        1. 実施内容（チェックが入っているもの）のみを文章に含めてください。
        2. チェックが入っていない項目や、デフォルト値のままの未実施項目については一切触れないでください。
        3. 出力は要約した文章のみとしてください。「承知いたしました」や「要約結果：」などの余計な文言は一切含めないでください。
        
        利用者: ${selectedClient.name} 様
        サービス種別: ${formData.serviceType}
        ケア区分: ${formData.careType}
        
        【バイタル】
        体温: ${formData.vitalSigns?.temperature || '-'}℃
        血圧: ${formData.vitalSigns?.bloodPressureHigh || '-'}/${formData.vitalSigns?.bloodPressureLow || '-'}
        脈拍: ${formData.vitalSigns?.pulse || '-'}
        SpO2: ${formData.vitalSigns?.spo2 || '-'}
        顔色: ${formData.vitalSigns?.faceColor === 'good' ? '良好' : '不良'}
        
        【実施内容】
        ${activities.join(', ')}
        
        【食事・排泄】
        ${formData.mealInfo?.mealCare ? `食事(主食/副食): ${formData.mealInfo?.mainDish}割/${formData.mealInfo?.sideDish}割` : '食事介助なし'}
        ${formData.mealInfo?.fluidCare ? `水分: ${formData.mealInfo?.fluid}cc` : '水分補給なし'}
        排尿回数: ${formData.excretionInfo?.urinationCount}
        排便回数: ${formData.excretionInfo?.defecationCount}
        
        【現在のメモ】
        ${formData.generalNotes}
      `;

      const response = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'API response error');
      }

      const data = await response.json();
      const generatedText = data.text?.trim();

      if (generatedText) {
        setFormData(prev => ({
          ...prev,
          generalNotes: generatedText
        }));
      }
    } catch (error) {
      console.error('AI Generation Error:', error);
      alert('AIによる文章作成に失敗しました。');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const clientsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      setClients(clientsData);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (selectedClientId) {
      const client = clients.find(c => c.id === selectedClientId);
      setSelectedClient(client || null);
    }
  }, [selectedClientId, clients]);

  // Auto-calculate change
  useEffect(() => {
    const deposit = formData.moneyManagement?.deposit || 0;
    const spent = formData.moneyManagement?.totalSpent || 0;
    setFormData(prev => ({
      ...prev,
      moneyManagement: {
        ...prev.moneyManagement!,
        change: deposit - spent
      }
    }));
  }, [formData.moneyManagement?.deposit, formData.moneyManagement?.totalSpent]);

  const handleVitalChange = (field: keyof VitalSigns, value: string) => {
    let finalValue: string = value;
    
    // Filter non-numeric characters (allow decimal point for temperature)
    if (field === 'temperature') {
      finalValue = value.replace(/[^0-9.]/g, '');
      // Auto-format: if 3 digits and no decimal point, insert it (e.g., 365 -> 36.5)
      if (finalValue.length === 3 && !finalValue.includes('.')) {
        finalValue = (parseFloat(finalValue) / 10).toFixed(1);
      }
    } else {
      finalValue = value.replace(/[^0-9]/g, '');
    }

    setFormData(prev => ({
      ...prev,
      vitalSigns: { 
        ...prev.vitalSigns!, 
        [field]: finalValue === '' ? undefined : (field === 'temperature' ? parseFloat(finalValue) : parseInt(finalValue)) 
      }
    }));
  };

  const handleVitalKeyDown = (e: React.KeyboardEvent, nextFieldId?: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (nextFieldId) {
        const nextElement = document.getElementById(nextFieldId);
        if (nextElement) {
          (nextElement as HTMLElement).focus();
        }
      }
    }
  };

  const handleNestedChange = (section: keyof CareRecord, subSection: string, field: string, value: any) => {
    setFormData(prev => {
      const currentSection = (prev[section] as any) || {};
      if (subSection === '') {
        return {
          ...prev,
          [section]: {
            ...currentSection,
            [field]: value
          }
        };
      }
      const currentSubSection = currentSection[subSection] || {};
      return {
        ...prev,
        [section]: {
          ...currentSection,
          [subSection]: {
            ...currentSubSection,
            [field]: value
          }
        }
      };
    });
  };

  const addPhrase = (phrase: string) => {
    setFormData(prev => ({
      ...prev,
      generalNotes: prev.generalNotes ? `${prev.generalNotes}\n${phrase}` : phrase
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedClientId) return;

    setIsSubmitting(true);
    try {
      const signature = sigCanvas.current?.isEmpty() ? null : sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png');
      
      const recordData = {
        ...formData,
        clientId: selectedClientId,
        caregiverId: profile.id,
        caregiverName: profile.name || '担当者',
        signature,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, 'records'), recordData);

      // Update schedule status if applicable
      if (initialData?.scheduleId) {
        if (initialData.scheduleId.startsWith('recurring-')) {
          // If it's a recurring schedule, create a new explicit one marked as completed
          await addDoc(collection(db, 'schedules'), {
            clientId: selectedClientId,
            caregiverId: profile.id,
            date: formData.date,
            startTime: formData.startTime,
            endTime: formData.endTime,
            careType: formData.careType,
            status: 'completed'
          });
        } else {
          // If it's a real schedule, update it and set the caregiver if it was unassigned
          await updateDoc(doc(db, 'schedules', initialData.scheduleId), {
            status: 'completed',
            caregiverId: profile.id
          });
        }
      }

      setLastSavedRecord(recordData);
      setIsSubmitted(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'records');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (isSubmitted && lastSavedRecord) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
        <div className="max-w-4xl w-full space-y-8 my-auto no-print">
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 text-center space-y-6">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-900">記録を保存しました</h2>
              <p className="text-slate-500">
                {selectedClient?.name} 様の記録が正常に保存されました。
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <button
                onClick={handlePrint}
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-8 rounded-2xl transition-all active:scale-95 shadow-lg shadow-emerald-100"
              >
                <Printer className="w-5 h-5" />
                記録を印刷 / PDF出力
              </button>
              <button
                onClick={onSuccess}
                className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 px-8 rounded-2xl transition-all active:scale-95"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>

        {/* Print View Section - only visible when printing */}
        <div className="print-only print-area fixed inset-0 bg-white p-8 text-slate-900 font-sans z-[70] overflow-visible">
          <div className="border-2 border-slate-900 p-6 space-y-8">
            <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
              <div>
                <h1 className="text-2xl font-bold">サービス実施記録</h1>
                <p className="text-sm text-slate-500">Service Record</p>
              </div>
              <div className="text-right">
                <p className="font-bold">{lastSavedRecord.date}</p>
                <p className="text-sm">{lastSavedRecord.startTime} 〜 {lastSavedRecord.endTime}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-1">
                <p className="text-xs text-slate-500">利用者名</p>
                <p className="text-xl font-bold border-b border-slate-300 pb-1">{selectedClient?.name} 様</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-slate-500">サービス種別 / ケア区分</p>
                <p className="text-lg font-bold border-b border-slate-300 pb-1">
                  {lastSavedRecord.serviceType} / {lastSavedRecord.careType}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 border border-slate-300 p-4 rounded-lg">
              <div className="text-center border-r border-slate-200">
                <p className="text-[10px] text-slate-500">体温</p>
                <p className="font-bold">{lastSavedRecord.vitalSigns?.temperature} ℃</p>
              </div>
              <div className="text-center border-r border-slate-200">
                <p className="text-[10px] text-slate-500">血圧</p>
                <p className="font-bold">{lastSavedRecord.vitalSigns?.bloodPressureHigh}/{lastSavedRecord.vitalSigns?.bloodPressureLow}</p>
              </div>
              <div className="text-center border-r border-slate-200">
                <p className="text-[10px] text-slate-500">脈拍</p>
                <p className="font-bold">{lastSavedRecord.vitalSigns?.pulse} 回/分</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-slate-500">SpO2</p>
                <p className="font-bold">{lastSavedRecord.vitalSigns?.spo2} %</p>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold border-l-4 border-slate-900 pl-2">実施内容・特記事項</h3>
              <div className="min-h-[200px] border border-slate-300 p-4 rounded-lg whitespace-pre-wrap text-sm leading-relaxed">
                {lastSavedRecord.generalNotes}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-12 pt-8">
              <div className="space-y-4">
                <p className="text-xs font-bold text-slate-500">担当者印</p>
                <div className="w-32 h-32 border-2 border-red-500 rounded-full flex items-center justify-center text-red-500 font-bold text-lg p-2 text-center break-all">
                  {lastSavedRecord.caregiverName}
                </div>
              </div>
              <div className="space-y-4">
                <p className="text-xs font-bold text-slate-500">本人署名</p>
                <div className="w-full h-32 border-2 border-slate-300 rounded-xl flex items-center justify-center overflow-hidden">
                  {lastSavedRecord.signature ? (
                    <img src={lastSavedRecord.signature} alt="Signature" className="max-h-full" />
                  ) : (
                    <span className="text-slate-300 text-xs italic">署名なし</span>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-8 text-[10px] text-slate-400 text-center">
              この記録はシステムによって作成されました。
            </div>
          </div>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            .no-print { display: none !important; }
            .print-only { display: block !important; position: static !important; }
            body { background: white !important; -webkit-print-color-adjust: exact; }
            @page { margin: 1cm; }
          }
          @media screen {
            .print-only { display: none; }
          }
        ` }} />
      </div>
    );
  }

  const renderVitalInput = (label: string, field: keyof VitalSigns, step: number = 1, unit: string = '', nextFieldId?: string) => (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-slate-900">{label}</label>
      <div className="relative">
        <input
          id={`vital-${field}`}
          type="text"
          inputMode={field === 'temperature' ? 'decimal' : 'numeric'}
          autoComplete="off"
          data-lpignore="true"
          value={formData.vitalSigns?.[field] ?? ''}
          onChange={(e) => handleVitalChange(field, e.target.value)}
          onKeyDown={(e) => handleVitalKeyDown(e, nextFieldId)}
          className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-center font-bold text-slate-900 text-lg"
        />
        {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">{unit}</span>}
      </div>
    </div>
  );

  const renderCheckbox = (section: keyof CareRecord, subSection: string, field: string, label: string) => {
    const isChecked = subSection === '' 
      ? (formData[section] as any)?.[field]
      : (formData[section] as any)?.[subSection]?.[field];
    return (
      <label className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer ${
        isChecked 
          ? 'border-emerald-600 bg-emerald-50 text-emerald-600' 
          : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200'
      }`}>
        <input
          type="checkbox"
          checked={!!isChecked}
          onChange={(e) => handleNestedChange(section, subSection, field, e.target.checked)}
          className="hidden"
        />
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          isChecked ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-300'
        }`}>
          {isChecked && <CheckCircle2 size={14} className="text-white" />}
        </div>
        <span className="font-medium text-slate-900">{label}</span>
      </label>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto items-start">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl my-4 md:my-8 flex flex-col"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10 rounded-t-3xl">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">サービス提供記録</h2>
              {selectedClient && (
                <div className="flex flex-col mt-0.5 min-w-0">
                  <span className="text-lg font-black text-slate-900 leading-tight truncate">{selectedClient.name} 様</span>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{selectedClient.furigana || 'フリガナなし'}</span>
                    {selectedClient.address && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedClient.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 transition-colors underline underline-offset-2"
                      >
                        <MapPin size={10} className="text-emerald-400" />
                        <span className="truncate max-w-[150px] sm:max-w-[300px]">{selectedClient.address}</span>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          {/* 1. 訪問基本情報 */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 bg-slate-50 p-4 rounded-2xl">
            <div className="space-y-1 lg:col-span-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">利用者</label>
              <select
                required
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-slate-900 font-medium"
              >
                <option value="">利用者を選択</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 lg:col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">訪問日</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-slate-900 font-medium"
              />
            </div>
            <div className="space-y-1 lg:col-span-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">訪問時間</label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  required
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-slate-900 font-medium"
                />
                <span className="text-slate-400">~</span>
                <input
                  type="time"
                  required
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-slate-900 font-medium"
                />
              </div>
            </div>
            <div className="space-y-1 lg:col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">サービス種別</label>
              <select
                required
                value={formData.serviceType}
                onChange={(e) => setFormData({ ...formData, serviceType: e.target.value as any })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-slate-900 font-medium"
              >
                <option value="訪問介護">訪問介護</option>
                <option value="障害福祉">障害福祉</option>
                <option value="移動支援">移動支援</option>
                <option value="制度外">制度外</option>
              </select>
            </div>
            <div className="space-y-1 lg:col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">ケア区分</label>
              <select
                required
                value={formData.careType}
                onChange={(e) => setFormData({ ...formData, careType: e.target.value as any })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-slate-900 font-medium"
              >
                <option value="身体介護">身体介護</option>
                <option value="生活援助">生活援助</option>
                <option value="身体・生活">身体・生活</option>
                <option value="その他">その他</option>
              </select>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Vitals & Pre-check */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-6 shadow-sm">
                <div className="flex items-center gap-2 text-emerald-600">
                  <Activity size={20} />
                  <h3 className="font-bold text-slate-900">バイタル・事前チェック</h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900">顔色</label>
                    <div className="flex gap-2">
                      {['good', 'bad'].map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => handleVitalChange('faceColor', status as any)}
                          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                            formData.vitalSigns?.faceColor === status
                              ? 'bg-emerald-600 text-white shadow-md'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {status === 'good' ? '良' : '不良'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900">発汗</label>
                    <div className="flex gap-2">
                      {['none', 'exists'].map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => handleVitalChange('sweating', status as any)}
                          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                            formData.vitalSigns?.sweating === status
                              ? 'bg-emerald-600 text-white shadow-md'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {status === 'none' ? '無' : '有'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                  <div className="space-y-4">
                    {renderVitalInput('体温', 'temperature', 0.1, '℃', 'vital-bloodPressureHigh')}
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-slate-900">血圧 (最高 / 最低)</label>
                      <div className="flex items-center gap-2">
                        <input
                          id="vital-bloodPressureHigh"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={formData.vitalSigns?.bloodPressureHigh ?? ''}
                          onChange={(e) => handleVitalChange('bloodPressureHigh', e.target.value)}
                          onKeyDown={(e) => handleVitalKeyDown(e, 'vital-bloodPressureLow')}
                          placeholder="最高"
                          className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 text-center font-bold text-slate-900 text-lg"
                        />
                        <span className="text-slate-400">/</span>
                        <input
                          id="vital-bloodPressureLow"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={formData.vitalSigns?.bloodPressureLow ?? ''}
                          onChange={(e) => handleVitalChange('bloodPressureLow', e.target.value)}
                          onKeyDown={(e) => handleVitalKeyDown(e, 'vital-pulse')}
                          placeholder="最低"
                          className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 text-center font-bold text-slate-900 text-lg"
                        />
                      </div>
                    </div>
                  <div className="grid grid-cols-2 gap-4">
                    {renderVitalInput('脈拍', 'pulse', 1, '回/分', 'vital-spo2')}
                    {renderVitalInput('SpO2', 'spo2', 1, '%')}
                  </div>
                </div>
              </div>

              {/* 預かり金管理 */}
              <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => setIsMoneyOpen(!isMoneyOpen)}
                  className="w-full flex items-center justify-between p-5 text-emerald-600 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Wallet size={20} />
                    <h3 className="font-bold text-slate-900">預かり金・買い物管理</h3>
                  </div>
                  <ChevronDown size={20} className={`transition-transform ${isMoneyOpen ? 'rotate-180' : ''}`} />
                </button>
                
                <motion.div
                  initial={false}
                  animate={{ height: isMoneyOpen ? 'auto' : 0, opacity: isMoneyOpen ? 1 : 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-5 pt-0 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-900">預かり金</label>
                        <input
                          type="number"
                          value={formData.moneyManagement?.deposit || ''}
                          onChange={(e) => handleNestedChange('moneyManagement', '', 'deposit', parseInt(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-slate-900 font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-900">買物総額</label>
                        <input
                          type="number"
                          value={formData.moneyManagement?.totalSpent || ''}
                          onChange={(e) => handleNestedChange('moneyManagement', '', 'totalSpent', parseInt(e.target.value))}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-slate-900 font-bold"
                        />
                      </div>
                    </div>
                    <div className={`p-3 rounded-xl flex items-center justify-between ${
                      (formData.moneyManagement?.change || 0) < 0 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-900'
                    }`}>
                      <span className="text-sm font-bold">お釣り</span>
                      <span className="text-lg font-black">¥ {(formData.moneyManagement?.change || 0).toLocaleString()}</span>
                    </div>
                    <textarea
                      placeholder="購入店や品目のメモ"
                      value={formData.moneyManagement?.details || ''}
                      onChange={(e) => handleNestedChange('moneyManagement', '', 'details', e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 text-sm text-slate-900"
                      rows={2}
                    />
                  </div>
                </motion.div>
              </div>
            </div>

            {/* Right Column: Service Items */}
            <div className="lg:col-span-8 space-y-8">
              {/* Tabs (Only show if both or other is selected) */}
              {(formData.careType === '身体・生活' || formData.careType === 'その他') && (
                <div className="flex p-1 bg-slate-100 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setActiveTab('physical')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${
                      activeTab === 'physical' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Heart size={18} />
                    身体介護
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('life')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${
                      activeTab === 'life' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Home size={18} />
                    生活援助
                  </button>
                </div>
              )}

              <div className="space-y-8">
                {activeTab === 'physical' && (formData.careType === '身体介護' || formData.careType === '身体・生活' || formData.careType === 'その他') ? (
                  <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                    {/* 排泄 */}
                    <div className="space-y-4">
                      <h4 className="font-bold text-slate-900 flex items-center gap-2">
                        <Droplets size={18} className="text-emerald-500" />
                        排泄
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {renderCheckbox('excretionInfo', '', 'toiletCare', 'トイレ介助')}
                        {renderCheckbox('excretionInfo', '', 'diaperChange', 'おむつ交換')}
                        {renderCheckbox('excretionInfo', '', 'padChange', 'パッド交換')}
                        {renderCheckbox('excretionInfo', '', 'genitalCleaning', '陰部洗浄')}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500">排尿詳細</label>
                          <div className="flex gap-2">
                            <input
                              placeholder="回数"
                              value={formData.excretionInfo?.urinationCount || ''}
                              onChange={(e) => handleNestedChange('excretionInfo', '', 'urinationCount', parseInt(e.target.value))}
                              className="w-20 px-3 py-2 border border-slate-200 rounded-lg text-slate-900"
                            />
                            <input
                              placeholder="量・内容"
                              value={formData.excretionInfo?.urinationAmount || ''}
                              onChange={(e) => handleNestedChange('excretionInfo', '', 'urinationAmount', e.target.value)}
                              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-slate-900"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500">排便詳細</label>
                          <div className="flex gap-2">
                            <input
                              placeholder="回数"
                              value={formData.excretionInfo?.defecationCount || ''}
                              onChange={(e) => handleNestedChange('excretionInfo', '', 'defecationCount', parseInt(e.target.value))}
                              className="w-20 px-3 py-2 border border-slate-200 rounded-lg text-slate-900"
                            />
                            <input
                              placeholder="性状・内容"
                              value={formData.excretionInfo?.defecationStatus || ''}
                              onChange={(e) => handleNestedChange('excretionInfo', '', 'defecationStatus', e.target.value)}
                              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-slate-900"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 食事 */}
                    <div className="space-y-4">
                      <h4 className="font-bold text-slate-900 flex items-center gap-2">
                        <Utensils size={18} className="text-orange-500" />
                        食事・水分
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        {renderCheckbox('mealInfo', '', 'mealCare', '食事介助')}
                        {renderCheckbox('mealInfo', '', 'fluidCare', '水分補給')}
                      </div>

                      <AnimatePresence>
                        {formData.mealInfo?.mealCare && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="space-y-4 overflow-hidden"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-orange-50/30 p-4 rounded-2xl border border-orange-100">
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500">主食摂取量 (0-10割)</label>
                                <input
                                  type="range"
                                  min="0"
                                  max="10"
                                  value={formData.mealInfo?.mainDish || 0}
                                  onChange={(e) => handleNestedChange('mealInfo', '', 'mainDish', parseInt(e.target.value))}
                                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                                <div className="flex justify-between text-xs text-slate-400 font-bold">
                                  <span>0</span>
                                  <span className="text-orange-600 text-sm">{formData.mealInfo?.mainDish} 割</span>
                                  <span>10</span>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500">副食摂取量 (0-10割)</label>
                                <input
                                  type="range"
                                  min="0"
                                  max="10"
                                  value={formData.mealInfo?.sideDish || 0}
                                  onChange={(e) => handleNestedChange('mealInfo', '', 'sideDish', parseInt(e.target.value))}
                                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                                <div className="flex justify-between text-xs text-slate-400 font-bold">
                                  <span>0</span>
                                  <span className="text-orange-600 text-sm">{formData.mealInfo?.sideDish} 割</span>
                                  <span>10</span>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <AnimatePresence>
                        {formData.mealInfo?.fluidCare && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-2 bg-blue-50/30 p-4 rounded-2xl border border-blue-100">
                              <label className="text-xs font-bold text-slate-500">水分量 (cc)</label>
                              <div className="flex items-center gap-3">
                                <input
                                  type="number"
                                  placeholder="例: 200"
                                  value={formData.mealInfo?.fluid || ''}
                                  onChange={(e) => handleNestedChange('mealInfo', '', 'fluid', parseInt(e.target.value))}
                                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-slate-900 font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <span className="text-sm font-bold text-slate-400">cc</span>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* 清潔・入浴 & 移動 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <h4 className="font-bold text-slate-900 flex items-center gap-2">
                          <Bath size={18} className="text-cyan-500" />
                          清潔・入浴
                        </h4>
                        <div className="flex flex-col gap-2">
                          {renderCheckbox('physicalCare', 'hygiene', 'wipingFull', '清拭（全身）')}
                          {renderCheckbox('physicalCare', 'hygiene', 'wipingPartial', '清拭（部分）')}
                          {renderCheckbox('physicalCare', 'hygiene', 'bathing', '全身浴')}
                          {renderCheckbox('physicalCare', 'hygiene', 'hairWash', '洗髪')}
                          {renderCheckbox('physicalCare', 'hygiene', 'oralCare', '口腔ケア')}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <h4 className="font-bold text-slate-900 flex items-center gap-2">
                          <ShieldCheck size={18} className="text-purple-500" />
                          移動・その他
                        </h4>
                        <div className="flex flex-col gap-2">
                          {renderCheckbox('physicalCare', 'movement', 'positioning', '体位変換')}
                          {renderCheckbox('physicalCare', 'movement', 'transfer', '移乗介助')}
                          {renderCheckbox('physicalCare', 'movement', 'dressing', '更衣介助')}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (activeTab === 'life' && (formData.careType === '生活援助' || formData.careType === '身体・生活' || formData.careType === 'その他')) ? (
                  <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-300">
                    {/* 掃除 & 洗濯 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <h4 className="font-bold text-slate-900 flex items-center gap-2">
                          <Home size={18} className="text-emerald-500" />
                          掃除
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          {renderCheckbox('lifeSupport', 'cleaning', 'room', '居室')}
                          {renderCheckbox('lifeSupport', 'cleaning', 'toilet', 'トイレ')}
                          {renderCheckbox('lifeSupport', 'cleaning', 'kitchen', '台所')}
                          {renderCheckbox('lifeSupport', 'cleaning', 'bath', '浴室')}
                          {renderCheckbox('lifeSupport', 'cleaning', 'pToilet', 'Pトイレ')}
                          {renderCheckbox('lifeSupport', 'cleaning', 'garbage', 'ゴミ出し')}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <h4 className="font-bold text-slate-900 flex items-center gap-2">
                          <Droplets size={18} className="text-emerald-400" />
                          洗濯
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          {renderCheckbox('lifeSupport', 'laundry', 'wash', '洗濯')}
                          {renderCheckbox('lifeSupport', 'laundry', 'dry', '乾燥')}
                          {renderCheckbox('lifeSupport', 'laundry', 'storage', '収納')}
                          {renderCheckbox('lifeSupport', 'laundry', 'ironing', 'アイロン')}
                        </div>
                      </div>
                    </div>

                    {/* 調理 */}
                    <div className="space-y-4">
                      <h4 className="font-bold text-slate-900 flex items-center gap-2">
                        <Utensils size={18} className="text-orange-400" />
                        調理
                      </h4>
                      <div className="grid grid-cols-3 gap-3">
                        {renderCheckbox('lifeSupport', 'cooking', 'prep', '下拵え')}
                        {renderCheckbox('lifeSupport', 'cooking', 'cook', '調理')}
                        {renderCheckbox('lifeSupport', 'cooking', 'serving', '配膳・下膳')}
                      </div>
                      <textarea
                        placeholder="献立内容を入力"
                        value={formData.lifeSupport?.cooking?.menu || ''}
                        onChange={(e) => handleNestedChange('lifeSupport', 'cooking', 'menu', e.target.value)}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 text-slate-900"
                        rows={3}
                      />
                    </div>

                    {/* 買い物 */}
                    <div className="space-y-4">
                      <h4 className="font-bold text-slate-900 flex items-center gap-2">
                        <ShoppingBag size={18} className="text-pink-500" />
                        買い物
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        {renderCheckbox('lifeSupport', 'shopping', 'daily', '日用品等')}
                        {renderCheckbox('lifeSupport', 'shopping', 'medicine', '薬の受取り')}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* 医療行為・自立支援 (Always visible) */}
                <div className="pt-8 border-t border-slate-100 space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                    <div className="space-y-4">
                      <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                        <Pill size={16} className="text-red-500" />
                        服薬
                      </h4>
                      <div className="flex flex-col gap-2">
                        {renderCheckbox('otherServices', 'medication', 'support', '介助・確認')}
                        {renderCheckbox('otherServices', 'medication', 'application', '薬の塗布')}
                        {renderCheckbox('otherServices', 'medication', 'eyeDrops', '点眼')}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                        <Stethoscope size={16} className="text-emerald-500" />
                        医療行為
                      </h4>
                      <div className="flex flex-col gap-2">
                        {renderCheckbox('otherServices', 'medical', 'suction', '痰の吸引')}
                        {renderCheckbox('otherServices', 'medical', 'enema', '浣腸')}
                        {renderCheckbox('otherServices', 'medical', 'prepCleanup', '準備・後片付け')}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                        <ShieldCheck size={16} className="text-amber-500" />
                        自立支援
                      </h4>
                      <div className="flex flex-col gap-2">
                        {renderCheckbox('otherServices', 'selfReliance', 'housework', '共に行う家事')}
                        {renderCheckbox('otherServices', 'selfReliance', 'dementiaCare', '認知症ケア')}
                        {renderCheckbox('otherServices', 'selfReliance', 'fallPrevention', '転倒予防')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 特記事項 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                      <AlertCircle size={18} className="text-slate-400" />
                      特記事項
                    </h4>
                    <div className="flex items-center gap-2">
                      <button 
                        type="button" 
                        onClick={generateAINotes}
                        disabled={isGeneratingAI || !selectedClient}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
                          isGeneratingAI 
                            ? "bg-slate-100 text-slate-400" 
                            : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                        )}
                      >
                        {isGeneratingAI ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        AI文章作成
                      </button>
                      <button 
                        type="button" 
                        onClick={startVoiceInput}
                        className={cn(
                          "p-2 rounded-full transition-all",
                          isListening ? "bg-red-500 text-white animate-pulse" : "text-emerald-600 hover:bg-emerald-50"
                        )}
                      >
                        <Mic size={20} />
                      </button>
                    </div>
                  </div>
                  
                  {/* Phrase Chips */}
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(PHRASE_CHIPS)
                      .filter(([key]) => {
                        if (activeTab === 'physical') return ['excretion', 'meal', 'hygiene', 'general'].includes(key);
                        if (activeTab === 'life') return ['general'].includes(key);
                        return true;
                      })
                      .map(([key, phrases]) => (
                        phrases.map((phrase, i) => (
                          <button
                            key={`${key}-${i}`}
                            type="button"
                            onClick={() => addPhrase(phrase)}
                            className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold hover:bg-slate-200 transition-colors"
                          >
                            {phrase}
                          </button>
                        ))
                      ))}
                  </div>

                  <textarea
                    ref={textareaRef}
                    required
                    placeholder="ケア中の気づきや利用者の言葉など"
                    value={formData.generalNotes}
                    onChange={(e) => setFormData({ ...formData, generalNotes: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 text-slate-900 min-h-[120px] overflow-hidden resize-none"
                  />
                </div>

                {/* 退室確認 (Lightened Section) */}
                <div className="bg-slate-100 border border-slate-200 rounded-3xl p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={20} className="text-emerald-600" />
                    <h3 className="font-bold text-slate-900">退室確認点検</h3>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {['fire', 'electricity', 'water', 'locking'].map((item) => {
                      const labels: Record<string, string> = { fire: '火の元', electricity: '電気', water: '水道', locking: '戸締り' };
                      const isChecked = (formData.exitCheck as any)?.[item];
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => handleNestedChange('exitCheck', '', item, !isChecked)}
                          className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all border-2 ${
                            isChecked 
                              ? 'bg-emerald-600 border-emerald-600 text-white shadow-md' 
                              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            isChecked ? 'bg-white border-white text-emerald-600' : 'border-slate-300'
                          }`}>
                            {isChecked && <CheckCircle2 size={14} />}
                          </div>
                          <span className="text-xs font-bold">{labels[item]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 署名 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                      <PenTool size={18} className="text-slate-400" />
                      利用者様確認
                    </h4>
                    <button 
                      type="button"
                      onClick={() => sigCanvas.current?.clear()}
                      className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <RotateCcw size={14} />
                      書き直し
                    </button>
                  </div>

                  <div className="relative">
                    <div className={`border-2 border-slate-200 rounded-2xl overflow-hidden bg-slate-50 ${formData.oralConsent ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
                      <SignatureCanvas 
                        ref={sigCanvas}
                        penColor="#0f172a"
                        canvasProps={{
                          className: "w-full h-48 cursor-crosshair"
                        }}
                      />
                    </div>
                    {formData.oralConsent && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-white/90 px-4 py-2 rounded-full shadow-lg border border-slate-100 flex items-center gap-2 text-emerald-600 font-bold">
                          <CheckCircle2 size={20} />
                          口頭同意済み
                        </div>
                      </div>
                    )}
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={formData.oralConsent}
                      onChange={(e) => setFormData({ ...formData, oralConsent: e.target.checked })}
                      className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors">
                      署名困難なため、口頭にて同意をいただきました
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 flex gap-4 sticky bottom-0 bg-white/80 backdrop-blur-sm pb-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 px-6 border border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-white transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedClientId}
              className="flex-1 py-4 px-6 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
              記録を保存する
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
