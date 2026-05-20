import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Client, ConferenceReply } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore';
import { 
  Building2, 
  Sparkles, 
  Check, 
  X, 
  FileText, 
  Info, 
  Printer, 
  Send,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';

export default function ConferenceManagement() {
  const [clients, setClients] = useState<Client[]>([]);
  const [replies, setReplies] = useState<ConferenceReply[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  
  // Form State
  const [caregiverNotes, setCaregiverNotes] = useState('');
  const [inquiryText, setInquiryText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Results
  const [generatedReply, setGeneratedReply] = useState<string>('');
  const [meetingSummary, setMeetingSummary] = useState<string>('');
  const [mode, setMode] = useState<'absent' | 'attend'>('absent');

  useEffect(() => {
    const unsubClients = onSnapshot(
      collection(db, 'clients'),
      (snapshot) => setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'clients')
    );

    const unsubReplies = onSnapshot(
      collection(db, 'conference_replies'),
      (snapshot) => setReplies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ConferenceReply))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'conference_replies')
    );

    return () => {
      unsubClients();
      unsubReplies();
    };
  }, []);

  const selectedClient = clients.find(c => c.id === selectedClientId);

  const handleCreateReply = async () => {
    if (!selectedClientId) return;
    setIsGenerating(true);
    try {
      const response = await fetch('/api/gemini/generate-conference-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: selectedClient?.name || '',
          caregiverName: 'ながら介護事業所 担当スタッフ',
          inquiryText: inquiryText,
          caregiverNotes: caregiverNotes
        })
      });

      if (!response.ok) throw new Error('AI回答文の作成に失敗しました');
      const data = await response.json();
      setGeneratedReply(data.text);
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateMeetingSummary = async () => {
    if (!selectedClientId) return;
    setIsGenerating(true);
    try {
      const prompt = `あなたは訪問介護の専門責任者です。
利用者「${selectedClient?.name || ''}様」の担当者会議における「当事業所としての発表内容（現状報告、サービス課題）」および「他サービスの事業所に提供・連携する情報のまとめ」を作成してください。
最近の当事業所での様子は以下です：
${caregiverNotes}

出力は以下の見出しを含んだMarkdown形式にしてください。
- ■ 当事業所での提供サービスの現状（身体介護・生活援助）
- ■ 会議で発言・提言すること（自立支援に向けた課題など）
- ■ 他サービス機関（デイ、訪問看護、薬局等）に共有したい注意点と連携希望点`;

      const response = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      if (!response.ok) throw new Error('AI要約の作成に失敗しました');
      const data = await response.json();
      setMeetingSummary(data.text);
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveReplyToFirestore = async () => {
    if (!selectedClientId || !generatedReply) return;
    try {
      await addDoc(collection(db, 'conference_replies'), {
        clientId: selectedClientId,
        clientName: selectedClient?.name || '',
        subject: 'サービス担当者会議 欠席照会回答書',
        inquiryText: inquiryText,
        replyText: generatedReply,
        creatorName: 'サービス提供責任者',
        createdAt: new Date().toISOString()
      });
      alert('照会回答書を送信・保存しました。');
      setGeneratedReply('');
      setInquiryText('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Title */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Building2 className="w-6 h-6 text-emerald-600" />
          サービス担当者会議支援ツール
        </h1>
        <p className="text-sm text-slate-500">
          ケアマネジャーから来た内容から会議で話す内容の整理、および欠席時の正式な「照会回答書」の自動返送・記入をAIが支援します
        </p>
      </div>

      {/* Select Client & Goal */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-800">利用者を選択 *</label>
            <select
              value={selectedClientId}
              onChange={(e) => {
                setSelectedClientId(e.target.value);
                setGeneratedReply('');
                setMeetingSummary('');
              }}
              className="w-full px-4 py-3 bg-slate-55 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            >
              <option value="">利用者を選択してください</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name} 様</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-800 font-medium">参加ステータス</label>
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => setMode('absent')}
                className={cn(
                  "py-2 rounded-xl text-xs font-bold transition-all",
                  mode === 'absent' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                会議欠席（照会回答書を作成）
              </button>
              <button
                type="button"
                onClick={() => setMode('attend')}
                className={cn(
                  "py-2 rounded-xl text-xs font-bold transition-all",
                  mode === 'attend' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                会議出席（提言・共有メモ作成）
              </button>
            </div>
          </div>
        </div>

        {selectedClientId && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
            {mode === 'absent' && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-800 block">照会事項 (ケアマネジャーからの問い合わせ内容) *</label>
                <textarea
                  rows={4}
                  value={inquiryText}
                  onChange={(e) => setInquiryText(e.target.value)}
                  placeholder="例：自立歩行が不安定になっており、転倒リスクがないか。デイサービスや入浴時の水分補給がしっかり行えているかについて、他サービスとの兼ね合いを考慮し、訪問介護側の意見をお願いします。"
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-sans"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-800 block">当事業所での最近の活動状況・スタッフ特記日誌</label>
              <textarea
                rows={4}
                value={caregiverNotes}
                onChange={(e) => setCaregiverNotes(e.target.value)}
                placeholder="例：歩行器を利用することで室内移動は1人で自律的に行えています。しかし時より疲労が見られ、足元がふらつきます。水分は、コップ一杯の麦茶を、訪問毎に必ず促して召し上がっていただいています。入浴動作は自立度が高く見守りで十分です。"
                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-sans"
              />
            </div>
          </div>
        )}

        {selectedClientId && (
          <div className="pt-4 flex justify-end">
            <button
              onClick={mode === 'absent' ? handleCreateReply : handleCreateMeetingSummary}
              disabled={isGenerating}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold rounded-2xl flex items-center gap-2 transition-all shadow-md active:scale-95"
            >
              {isGenerating ? (
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {mode === 'absent' ? 'AI照会回答書の作成' : '会議発表・他サービス共有要約の作成'}
            </button>
          </div>
        )}
      </div>

      {!selectedClientId && (
        <div className="bg-emerald-50/50 p-8 rounded-2xl border border-emerald-100/50 text-center space-y-2">
          <AlertCircle className="w-10 h-10 text-emerald-600 mx-auto" />
          <p className="font-bold text-slate-900">利用者が選択されていません</p>
          <p className="text-sm text-slate-500 animate-pulse">
            どなたの担当者会議資料を作成するか、上のドロップダウンからお選びください。
          </p>
        </div>
      )}

      {/* Generated Outputs */}
      {selectedClientId && (generatedReply || meetingSummary) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Output Details */}
          <div className="md:col-span-2 space-y-6">
            {mode === 'absent' && generatedReply && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800">✉️ 生成された「サービス担当者会議 欠席照会回答書」案</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => window.print()}
                      className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center gap-1"
                    >
                      <Printer size={12} />
                      印刷プレビュー
                    </button>
                    <button
                      onClick={handleSaveReplyToFirestore}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow flex items-center gap-1"
                    >
                      <Send size={12} />
                      回答書を提出・保存
                    </button>
                  </div>
                </div>

                {/* Printable Business Letter Form */}
                <div id="conference-reply-printable" className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm text-slate-800 font-sans text-sm space-y-6 whitespace-pre-line leading-relaxed">
                  {/* Formal Japanese Business Header */}
                  <div className="flex justify-between items-start text-xs text-slate-500">
                    <span>各関係介護サービス事業所 各位</span>
                    <span>起案日: {format(new Date(), 'yyyy年MM月dd日')}</span>
                  </div>
                  
                  <div className="text-right text-xs text-slate-500 space-y-1">
                    <p>居宅介護サービス提供事業者：</p>
                    <p className="font-bold text-slate-700">ながら訪問介護事業所</p>
                    <p>サービス提供責任者 拝</p>
                  </div>

                  <h3 className="text-center text-lg font-bold border-b border-double border-slate-400 pb-2 mb-4 tracking-wider">
                    サービス担当者会議における照会への回答について
                  </h3>

                  <p>
                    いつも大変お世話になっております。
                    標記の件につきまして、下記のとおり回答いたします。会議を欠席するにあたり、何卒ご査収のほど、また関係機関の皆様におかれましてはご活用くださいますよう宜しくお願い申し上げます。
                  </p>

                  <div className="border border-slate-300 rounded-xl p-4 bg-slate-50 space-y-3">
                    <p className="font-bold text-xs text-slate-400 uppercase">ケアマネジャー様からの照会事項</p>
                    <p className="italic text-slate-600">{inquiryText || '（会議照会事項）'}</p>
                  </div>

                  <div className="markdown-body text-slate-800">
                    <ReactMarkdown>{generatedReply}</ReactMarkdown>
                  </div>
                  
                  <div className="border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
                    ながら介護事業所・AI担当者会議支援システム
                  </div>
                </div>
              </div>
            )}

            {mode === 'attend' && meetingSummary && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800">📢 作成した会議発表メモ・他サービス連絡要約</h3>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(meetingSummary);
                      alert('ミーティング要約をクリップボードにコピーしました！');
                    }}
                    className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold hover:bg-emerald-100"
                  >
                    コピーする
                  </button>
                </div>

                <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm text-slate-800 font-sans text-sm space-y-4 markdown-body leading-relaxed">
                  <ReactMarkdown>{meetingSummary}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          {/* Quick Guidance Panel */}
          <div className="space-y-6">
            <div className="bg-emerald-50/50 p-6 rounded-3xl border border-emerald-100/50 space-y-4">
              <h4 className="font-bold text-slate-800 flex items-center gap-1 text-sm">
                <Info size={16} className="text-emerald-600 animate-bounce" />
                介護保険と担当者会議のルール
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                サービス担当者会議への出席が基本ですが、やむを得ず欠席する場合は、この**照会回答書（欠席時回答書）**を提出することで、
                サービス事業者としての運営基準違反を防止し、ケアマネジャー（居宅サービス計画作成者）への信頼も維持されます。
                「ながらAI」が日誌・観察から正確な公式回答書を数秒で完成させます。
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-3">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-widest text-slate-400">過去の回答履歴 ({replies.filter(r => r.clientId === selectedClientId).length})</h4>
              {replies.filter(r => r.clientId === selectedClientId).length > 0 ? (
                <div className="space-y-2">
                  {replies.filter(r => r.clientId === selectedClientId).map(reply => (
                    <div key={reply.id} className="p-3 bg-white rounded-xl border border-slate-200 text-xs">
                      <p className="font-bold text-slate-800 truncate">{reply.subject}</p>
                      <span className="text-[10px] text-slate-400">{reply.createdAt ? format(new Date(reply.createdAt), 'yyyy-MM-dd') : '日時不明'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-[10px] italic">これまでに提出された照会回答はありません</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
