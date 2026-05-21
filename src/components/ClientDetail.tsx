import React, { useState, useEffect, useMemo } from 'react';
import {
  doc,
  onSnapshot,
  collection,
  query,
  where,
  updateDoc,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  Client,
  CarePlan,
  CareRecord,
  MonitoringReport,
  ConferenceReply,
  AssessmentInfo,
  AttachedFile,
  AttachmentCategory,
} from '../types';
import {
  ChevronLeft,
  User,
  ClipboardList,
  FileText,
  Briefcase,
  StickyNote,
  MapPin,
  Calendar,
  Heart,
  Pill,
  Users as UsersIcon,
  History,
  ScrollText,
  Paperclip,
  Edit2,
  Save,
  X,
  Download,
  Upload,
  Image as ImageIcon,
  FileType,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

interface Props {
  clientId: string;
  onBack: () => void;
}

type TabId =
  | 'basic'
  | 'assessment'
  | 'care-plan'
  | 'cm-plan'
  | 'records'
  | 'history'
  | 'other';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'basic', label: '基本情報', icon: <User className="w-4 h-4" /> },
  { id: 'assessment', label: 'アセスメント', icon: <ClipboardList className="w-4 h-4" /> },
  { id: 'care-plan', label: '訪問介護計画', icon: <FileText className="w-4 h-4" /> },
  { id: 'cm-plan', label: 'ケアマネプラン', icon: <Briefcase className="w-4 h-4" /> },
  { id: 'records', label: '訪問記録', icon: <History className="w-4 h-4" /> },
  { id: 'history', label: '履歴', icon: <ScrollText className="w-4 h-4" /> },
  { id: 'other', label: 'その他', icon: <StickyNote className="w-4 h-4" /> },
];

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

export default function ClientDetail({ clientId, onBack }: Props) {
  const [client, setClient] = useState<Client | null>(null);
  const [carePlans, setCarePlans] = useState<CarePlan[]>([]);
  const [records, setRecords] = useState<CareRecord[]>([]);
  const [monitoringReports, setMonitoringReports] = useState<MonitoringReport[]>([]);
  const [conferenceReplies, setConferenceReplies] = useState<ConferenceReply[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('basic');
  const [loading, setLoading] = useState(true);

  // 利用者本体
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'clients', clientId), (snap) => {
      if (snap.exists()) setClient({ id: snap.id, ...snap.data() } as Client);
      setLoading(false);
    });
    return unsub;
  }, [clientId]);

  // 訪問介護計画
  useEffect(() => {
    const q = query(collection(db, 'care_plans'), where('clientId', '==', clientId));
    return onSnapshot(q, (snap) => {
      setCarePlans(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CarePlan)));
    });
  }, [clientId]);

  // 訪問記録
  useEffect(() => {
    const q = query(collection(db, 'records'), where('clientId', '==', clientId));
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CareRecord));
      list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setRecords(list);
    });
  }, [clientId]);

  // モニタリング報告書
  useEffect(() => {
    const q = query(collection(db, 'monitoring_reports'), where('clientId', '==', clientId));
    return onSnapshot(q, (snap) => {
      setMonitoringReports(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MonitoringReport)));
    });
  }, [clientId]);

  // 照会回答書
  useEffect(() => {
    const q = query(collection(db, 'conference_replies'), where('clientId', '==', clientId));
    return onSnapshot(q, (snap) => {
      setConferenceReplies(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConferenceReply)));
    });
  }, [clientId]);

  if (loading) {
    return <div className="p-8 text-slate-500">読込中…</div>;
  }
  if (!client) {
    return (
      <div className="p-8">
        <button onClick={onBack} className="text-emerald-700 font-bold flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> 一覧に戻る
        </button>
        <p className="mt-4 text-slate-500">該当する利用者様が見つかりませんでした。</p>
      </div>
    );
  }

  const careLevel = carePlans[0]?.careLevel || '未認定';

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-emerald-700 transition-colors w-fit"
      >
        <ChevronLeft className="w-4 h-4" />
        利用者一覧に戻る
      </button>

      <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-6 md:p-8 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
          <div className="w-20 h-20 rounded-2xl bg-white/15 border-2 border-white/30 flex items-center justify-center text-3xl font-black backdrop-blur-md">
            {client.name?.[0] || '利'}
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">{client.name} 様</h1>
              {client.furigana && <span className="text-sm text-emerald-100/80 font-bold">{client.furigana}</span>}
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <span className="px-2.5 py-1 bg-white/15 rounded-full backdrop-blur-md">{careLevel}</span>
              {client.age != null && <span className="px-2.5 py-1 bg-white/15 rounded-full backdrop-blur-md">{client.age} 歳</span>}
              {client.gender && (
                <span className="px-2.5 py-1 bg-white/15 rounded-full backdrop-blur-md">
                  {client.gender === 'male' ? '男性' : client.gender === 'female' ? '女性' : 'その他'}
                </span>
              )}
              {client.address && (
                <span className="px-2.5 py-1 bg-white/15 rounded-full backdrop-blur-md flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {client.address}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <nav className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-3 text-sm font-bold whitespace-nowrap transition-all border-b-2',
              activeTab === t.id
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>

      {/* Tab body */}
      <div className="space-y-6">
        {activeTab === 'basic' && (
          <>
            <BasicTab client={client} />
            <AttachmentSection client={client} category="basic" title="基本情報の添付ファイル（保険証・本人確認など）" />
          </>
        )}
        {activeTab === 'assessment' && (
          <>
            <AssessmentTab client={client} />
            <AttachmentSection client={client} category="assessment" title="アセスメントシート原本" />
          </>
        )}
        {activeTab === 'care-plan' && (
          <>
            <CarePlanTab client={client} carePlans={carePlans} />
            <AttachmentSection client={client} category="care-plan" title="訪問介護計画書原本" />
          </>
        )}
        {activeTab === 'cm-plan' && (
          <>
            <CmPlanTab client={client} />
            <AttachmentSection client={client} category="cm-plan" title="ケアマネプラン・主治医意見書" />
          </>
        )}
        {activeTab === 'records' && (
          <>
            <RecordsTab client={client} records={records} />
            <AttachmentSection client={client} category="record" title="記録に関連する写真・補助資料" />
          </>
        )}
        {activeTab === 'history' && <HistoryTab monitoringReports={monitoringReports} conferenceReplies={conferenceReplies} />}
        {activeTab === 'other' && <OtherTab client={client} />}
      </div>
    </div>
  );
}

// ---------- 基本情報タブ ----------
function BasicTab({ client }: { client: Client }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Section title="プロフィール" icon={<User className="w-4 h-4" />}>
        <Row label="氏名" value={client.name} />
        <Row label="ふりがな" value={client.furigana || '-'} />
        <Row label="生年月日" value={client.birthDate || '-'} />
        <Row label="年齢" value={client.age != null ? `${client.age} 歳` : '-'} />
        <Row label="性別" value={client.gender === 'male' ? '男性' : client.gender === 'female' ? '女性' : client.gender ? 'その他' : '-'} />
      </Section>
      <Section title="連絡先・住所" icon={<MapPin className="w-4 h-4" />}>
        <Row label="住所" value={client.address || '-'} />
        <Row label="電話番号" value={client.phone || '-'} />
      </Section>
      <Section title="定期スケジュール" icon={<Calendar className="w-4 h-4" />} colSpanFull>
        {client.recurringSchedules && client.recurringSchedules.length > 0 ? (
          <div className="space-y-2">
            {client.recurringSchedules.map((rs, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-emerald-50/70 rounded-xl border border-emerald-100">
                <span className="px-2 py-0.5 bg-emerald-600 text-white text-xs font-bold rounded">{rs.careType}</span>
                <span className="text-sm font-bold text-slate-800">
                  毎週 {rs.daysOfWeek.map((d) => DAY_NAMES[d]).join('・')}曜日
                </span>
                <span className="text-sm text-slate-600">{rs.startTime}〜{rs.endTime}</span>
                <span className="text-xs text-slate-500 ml-auto">
                  {rs.frequency === 'weekly' ? '週次' : rs.frequency === 'biweekly_even' ? '偶数週' : '奇数週'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">定期スケジュール未登録</p>
        )}
      </Section>
      <Section title="特記事項" icon={<StickyNote className="w-4 h-4" />} colSpanFull>
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
          {client.notes || '特記事項なし'}
        </p>
      </Section>
    </div>
  );
}

// ---------- アセスメントタブ（編集UI付き） ----------
function AssessmentTab({ client }: { client: Client }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<AssessmentInfo>(client.assessment || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(client.assessment || {});
  }, [client.assessment]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'clients', client.id), {
        assessment: { ...draft, updatedAt: new Date().toISOString() },
      });
      setIsEditing(false);
    } catch (e: any) {
      alert(`保存に失敗しました: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(client.assessment || {});
    setIsEditing(false);
  };

  const a = isEditing ? draft : client.assessment;
  const hasData = !!client.assessment;

  if (!hasData && !isEditing) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all"
          >
            <Edit2 className="w-4 h-4" />
            アセスメントを入力
          </button>
        </div>
        <EmptyState
          icon={<ClipboardList className="w-12 h-12 text-slate-300" />}
          title="アセスメントシート未入力"
          description="ADL/IADL、認知機能、健康状態、社会的状況などのアセスメント情報がまだ登録されていません。"
        />
      </div>
    );
  }

  const adlOptions = ['自立', '一部介助', '全介助'];
  const ambulationOptions = ['自立', '杖', '歩行器', '車椅子', '寝たきり'];

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2">
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all"
          >
            <Edit2 className="w-4 h-4" />
            編集
          </button>
        ) : (
          <>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-bold transition-all"
            >
              <X className="w-4 h-4" />
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all"
            >
              <Save className="w-4 h-4" />
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="ADL（日常生活動作）" icon={<Heart className="w-4 h-4" />}>
          <EditableRow label="食事" value={a?.adl?.eating} options={adlOptions} editing={isEditing}
            onChange={(v) => setDraft({ ...draft, adl: { ...draft.adl, eating: v } })} />
          <EditableRow label="入浴" value={a?.adl?.bathing} options={adlOptions} editing={isEditing}
            onChange={(v) => setDraft({ ...draft, adl: { ...draft.adl, bathing: v } })} />
          <EditableRow label="排泄" value={a?.adl?.toileting} options={adlOptions} editing={isEditing}
            onChange={(v) => setDraft({ ...draft, adl: { ...draft.adl, toileting: v } })} />
          <EditableRow label="更衣" value={a?.adl?.dressing} options={adlOptions} editing={isEditing}
            onChange={(v) => setDraft({ ...draft, adl: { ...draft.adl, dressing: v } })} />
          <EditableRow label="移動" value={a?.adl?.ambulation} options={ambulationOptions} editing={isEditing}
            onChange={(v) => setDraft({ ...draft, adl: { ...draft.adl, ambulation: v } })} />
        </Section>
        <Section title="IADL（手段的日常生活動作）" icon={<ClipboardList className="w-4 h-4" />}>
          <EditableRow label="調理" value={a?.iadl?.cooking} options={adlOptions} editing={isEditing}
            onChange={(v) => setDraft({ ...draft, iadl: { ...draft.iadl, cooking: v } })} />
          <EditableRow label="買い物" value={a?.iadl?.shopping} options={adlOptions} editing={isEditing}
            onChange={(v) => setDraft({ ...draft, iadl: { ...draft.iadl, shopping: v } })} />
          <EditableRow label="掃除" value={a?.iadl?.cleaning} options={adlOptions} editing={isEditing}
            onChange={(v) => setDraft({ ...draft, iadl: { ...draft.iadl, cleaning: v } })} />
          <EditableRow label="服薬管理" value={a?.iadl?.medication} options={adlOptions} editing={isEditing}
            onChange={(v) => setDraft({ ...draft, iadl: { ...draft.iadl, medication: v } })} />
          <EditableRow label="電話" value={a?.iadl?.phone} options={adlOptions} editing={isEditing}
            onChange={(v) => setDraft({ ...draft, iadl: { ...draft.iadl, phone: v } })} />
        </Section>
        <Section title="認知機能">
          <EditableNumberRow label="HDS-R" value={a?.cognition?.hdsR} max={30} editing={isEditing}
            onChange={(v) => setDraft({ ...draft, cognition: { ...draft.cognition, hdsR: v } })} />
          <EditableNumberRow label="MMSE" value={a?.cognition?.mmse} max={30} editing={isEditing}
            onChange={(v) => setDraft({ ...draft, cognition: { ...draft.cognition, mmse: v } })} />
          <EditableTextRow label="所見" value={a?.cognition?.notes} multiline editing={isEditing}
            onChange={(v) => setDraft({ ...draft, cognition: { ...draft.cognition, notes: v } })} />
        </Section>
        <Section title="医療・健康" icon={<Pill className="w-4 h-4" />}>
          <EditableArrayRow label="既往歴" value={a?.health?.diseases} editing={isEditing}
            onChange={(v) => setDraft({ ...draft, health: { ...draft.health, diseases: v } })} />
          <EditableArrayRow label="服薬中" value={a?.health?.medications} editing={isEditing}
            onChange={(v) => setDraft({ ...draft, health: { ...draft.health, medications: v } })} />
          <EditableArrayRow label="アレルギー" value={a?.health?.allergies} editing={isEditing}
            onChange={(v) => setDraft({ ...draft, health: { ...draft.health, allergies: v } })} />
          <EditableTextRow label="医療上の注意" value={a?.health?.medicalNotes} multiline editing={isEditing}
            onChange={(v) => setDraft({ ...draft, health: { ...draft.health, medicalNotes: v } })} />
        </Section>
        <Section title="社会的状況" icon={<UsersIcon className="w-4 h-4" />} colSpanFull>
          <EditableTextRow label="同居家族" value={a?.social?.livingWith} editing={isEditing}
            onChange={(v) => setDraft({ ...draft, social: { ...draft.social, livingWith: v } })} />
          <EditableTextRow label="家族支援" value={a?.social?.familySupport} multiline editing={isEditing}
            onChange={(v) => setDraft({ ...draft, social: { ...draft.social, familySupport: v } })} />
          <EditableTextRow label="地域とのつながり" value={a?.social?.communityInvolvement} multiline editing={isEditing}
            onChange={(v) => setDraft({ ...draft, social: { ...draft.social, communityInvolvement: v } })} />
        </Section>
        {a?.updatedAt && !isEditing && (
          <div className="lg:col-span-2 text-xs text-slate-400 text-right">
            最終更新: {format(new Date(a.updatedAt), 'yyyy-MM-dd HH:mm')}
            {a.updatedBy && ` / ${a.updatedBy}`}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- 訪問介護計画タブ ----------
function CarePlanTab({ client, carePlans }: { client: Client; carePlans: CarePlan[] }) {
  if (carePlans.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="w-12 h-12 text-slate-300" />}
        title="訪問介護計画書未登録"
        description={`${client.name}様の訪問介護計画はまだ作成されていません。`}
      />
    );
  }
  return (
    <div className="space-y-5">
      {carePlans.map((plan) => (
        <Section key={plan.id} title={`訪問介護計画書（${plan.careLevel}）`} icon={<FileText className="w-4 h-4" />}>
          <Row label="認定有効期間" value={plan.period} />
          <Row label="現在のサービス内容" value={plan.currentService} multiline />
          <div className="pt-2">
            <p className="text-xs font-black text-slate-500 mb-2 tracking-wider uppercase">目標</p>
            <ul className="space-y-2">
              {plan.goals.map((g, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700 leading-relaxed">
                  <span className="inline-flex w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </div>
          {plan.createdAt && (
            <p className="text-xs text-slate-400 text-right pt-2">作成日: {format(new Date(plan.createdAt), 'yyyy-MM-dd')}</p>
          )}
        </Section>
      ))}
    </div>
  );
}

// ---------- ケアマネプランタブ ----------
function CmPlanTab({ client }: { client: Client }) {
  const cm = client.careMgrInfo;
  if (!cm) {
    return (
      <EmptyState
        icon={<Briefcase className="w-12 h-12 text-slate-300" />}
        title="ケアマネ情報未登録"
        description="担当ケアマネジャー様の情報やケアプランがまだ登録されていません。"
      />
    );
  }
  return (
    <div className="space-y-5">
      <Section title="担当ケアマネジャー" icon={<User className="w-4 h-4" />}>
        <Row label="氏名" value={cm.careManagerName || '-'} />
        <Row label="所属事業所" value={cm.careManagerOfficeName || '-'} />
        <Row label="連絡先" value={cm.careManagerPhone || '-'} />
      </Section>
      {cm.carePlanSummary && (
        <Section title="ケアプラン要旨" icon={<FileText className="w-4 h-4" />}>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{cm.carePlanSummary}</p>
        </Section>
      )}
      {cm.carePlanGoals && cm.carePlanGoals.length > 0 && (
        <Section title="目標" icon={<FileText className="w-4 h-4" />}>
          <ul className="space-y-2">
            {cm.carePlanGoals.map((g, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700 leading-relaxed">
                <span className="inline-flex w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-black items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {cm.updatedAt && (
        <div className="text-xs text-slate-400 text-right">
          最終更新: {format(new Date(cm.updatedAt), 'yyyy-MM-dd')}
        </div>
      )}
    </div>
  );
}

// ---------- 訪問記録タブ ----------
function RecordsTab({ client, records }: { client: Client; records: CareRecord[] }) {
  if (records.length === 0) {
    return (
      <EmptyState
        icon={<History className="w-12 h-12 text-slate-300" />}
        title="訪問記録なし"
        description={`${client.name}様への訪問記録はまだ登録されていません。`}
      />
    );
  }
  return (
    <div className="space-y-3">
      <div className="text-sm font-bold text-slate-600">
        {records.length} 件の訪問記録（新しい順）
      </div>
      {records.map((r) => (
        <div key={r.id} className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-emerald-300 transition-colors">
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm font-black text-slate-800">{r.date}</span>
              <span className="text-xs text-slate-500">{r.startTime}〜{r.endTime}</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded">{r.careType}</span>
            </div>
            <span className="text-xs text-slate-500">担当: {r.caregiverName || '-'}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-2">
            {r.vitalSigns?.temperature != null && (
              <span className="bg-slate-50 px-2 py-1 rounded">体温 <b className="text-slate-800">{r.vitalSigns.temperature}℃</b></span>
            )}
            {r.vitalSigns?.bloodPressureHigh != null && (
              <span className="bg-slate-50 px-2 py-1 rounded">血圧 <b className="text-slate-800">{r.vitalSigns.bloodPressureHigh}/{r.vitalSigns.bloodPressureLow}</b></span>
            )}
            {r.vitalSigns?.pulse != null && (
              <span className="bg-slate-50 px-2 py-1 rounded">脈拍 <b className="text-slate-800">{r.vitalSigns.pulse}</b></span>
            )}
            {r.vitalSigns?.spo2 != null && (
              <span className="bg-slate-50 px-2 py-1 rounded">SpO₂ <b className="text-slate-800">{r.vitalSigns.spo2}%</b></span>
            )}
          </div>
          {r.generalNotes && (
            <p className="text-sm text-slate-700 leading-relaxed border-t border-slate-100 pt-2 mt-2">
              {r.generalNotes}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- 履歴タブ ----------
function HistoryTab({
  monitoringReports,
  conferenceReplies,
}: {
  monitoringReports: MonitoringReport[];
  conferenceReplies: ConferenceReply[];
}) {
  if (monitoringReports.length === 0 && conferenceReplies.length === 0) {
    return (
      <EmptyState
        icon={<ScrollText className="w-12 h-12 text-slate-300" />}
        title="作成書類なし"
        description="モニタリング報告書や会議照会回答書はまだ作成されていません。「AIモニタリング・計画」や「サービス担当者会議」から作成できます。"
      />
    );
  }
  return (
    <div className="space-y-5">
      <Section title={`モニタリング報告書（${monitoringReports.length}件）`} icon={<FileText className="w-4 h-4" />}>
        {monitoringReports.length === 0 ? (
          <p className="text-sm text-slate-400">まだ作成されていません。</p>
        ) : (
          <ul className="space-y-2">
            {monitoringReports.map((m) => (
              <li key={m.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="text-sm font-bold text-slate-800">
                  {m.monitoringDate || (m.createdAt ? format(new Date(m.createdAt), 'yyyy-MM-dd') : '日付不明')}
                </span>
                <span className="text-xs text-slate-500">作成: {m.manager || '-'}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={`サービス担当者会議 照会回答書（${conferenceReplies.length}件）`} icon={<Briefcase className="w-4 h-4" />}>
        {conferenceReplies.length === 0 ? (
          <p className="text-sm text-slate-400">まだ作成されていません。</p>
        ) : (
          <ul className="space-y-2">
            {conferenceReplies.map((c) => (
              <li key={c.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm font-bold text-slate-800">{c.subject || '（件名なし）'}</p>
                  <p className="text-xs text-slate-500">作成: {c.creatorName || '-'}</p>
                </div>
                <span className="text-xs text-slate-500">
                  {c.createdAt ? format(new Date(c.createdAt), 'yyyy-MM-dd') : '日付不明'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// ---------- その他タブ（メモ + その他カテゴリのファイル） ----------
function OtherTab({ client }: { client: Client }) {
  return (
    <div className="space-y-5">
      <Section title="フリーメモ" icon={<StickyNote className="w-4 h-4" />}>
        {client.generalMemo ? (
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{client.generalMemo}</p>
        ) : (
          <p className="text-sm text-slate-400">メモなし</p>
        )}
      </Section>
      <AttachmentSection client={client} category="other" title="その他の添付ファイル" />
    </div>
  );
}

function AttachmentSection({
  client,
  category,
  title,
}: {
  client: Client;
  category: AttachmentCategory;
  title?: string;
}) {
  const files = (client.attachments || []).filter((f) => f.category === category);
  const handleUpload = () => {
    alert(`（モック）本番では「${title || category}」関連のファイル選択ダイアログが開きます。`);
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
        <h3 className="flex items-center gap-2 text-sm font-black text-slate-800">
          <Paperclip className="w-4 h-4" />
          {title || '添付ファイル'}
          <span className="text-xs font-normal text-slate-400">（{files.length}件）</span>
        </h3>
        <button
          onClick={handleUpload}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          アップロード
        </button>
      </div>
      <AttachmentFileList files={files} />
    </div>
  );
}

function AttachmentFileList({ files }: { files: AttachedFile[] }) {
  return (
    <div className="space-y-3">
      {files.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6 border-2 border-dashed border-slate-200 rounded-xl">
          添付ファイルなし
        </p>
      ) : (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                  {f.type === 'pdf' && <FileType className="w-5 h-5 text-rose-500" />}
                  {f.type === 'image' && <ImageIcon className="w-5 h-5 text-blue-500" />}
                  {(f.type === 'doc' || f.type === 'other') && <FileText className="w-5 h-5 text-slate-500" />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{f.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {f.uploadedAt && format(new Date(f.uploadedAt), 'yyyy-MM-dd')}
                    {f.uploaderName && ` ・ ${f.uploaderName}`}
                    {f.size && ` ・ ${f.size}`}
                  </p>
                </div>
              </div>
              <a
                href={f.url || '#'}
                onClick={(e) => {
                  if (!f.url || f.url === '#') {
                    e.preventDefault();
                    alert(`（モック）${f.name} をダウンロード／プレビューします。`);
                  }
                }}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:border-emerald-300 text-slate-600 hover:text-emerald-700 rounded-lg text-xs font-bold transition-colors shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                表示
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- 共通パーツ ----------
function Section({
  title,
  icon,
  children,
  colSpanFull = false,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  colSpanFull?: boolean;
}) {
  return (
    <div className={cn('bg-white rounded-2xl border border-slate-200 p-5 shadow-sm', colSpanFull && 'lg:col-span-2')}>
      <h3 className="flex items-center gap-2 text-sm font-black text-slate-800 mb-4 pb-3 border-b border-slate-100">
        {icon}
        {title}
      </h3>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Row({ label, value, multiline = false }: { label: string; value: React.ReactNode; multiline?: boolean }) {
  return (
    <div className={cn('grid gap-1', multiline ? 'grid-cols-1' : 'grid-cols-[120px_1fr]')}>
      <span className="text-xs font-bold text-slate-500 pt-0.5">{label}</span>
      <span className={cn('text-sm text-slate-800', multiline && 'leading-relaxed whitespace-pre-line')}>
        {value}
      </span>
    </div>
  );
}

function EditableRow({
  label,
  value,
  options,
  editing,
  onChange,
}: {
  label: string;
  value?: string;
  options: string[];
  editing: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-1 grid-cols-[120px_1fr]">
      <span className="text-xs font-bold text-slate-500 pt-1">{label}</span>
      {editing ? (
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
        >
          <option value="">未選択</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <span className="text-sm text-slate-800">{value || '-'}</span>
      )}
    </div>
  );
}

function EditableTextRow({
  label,
  value,
  multiline = false,
  editing,
  onChange,
}: {
  label: string;
  value?: string;
  multiline?: boolean;
  editing: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className={cn('grid gap-1', multiline ? 'grid-cols-1' : 'grid-cols-[120px_1fr]')}>
      <span className="text-xs font-bold text-slate-500 pt-1">{label}</span>
      {editing ? (
        multiline ? (
          <textarea
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 leading-relaxed"
          />
        ) : (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        )
      ) : (
        <span className={cn('text-sm text-slate-800', multiline && 'leading-relaxed whitespace-pre-line')}>
          {value || '-'}
        </span>
      )}
    </div>
  );
}

function EditableNumberRow({
  label,
  value,
  max,
  editing,
  onChange,
}: {
  label: string;
  value?: number;
  max?: number;
  editing: boolean;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="grid gap-1 grid-cols-[120px_1fr]">
      <span className="text-xs font-bold text-slate-500 pt-1">{label}</span>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={value ?? ''}
            min={0}
            max={max}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
            className="w-20 text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
          {max && <span className="text-xs text-slate-400">/ {max}</span>}
        </div>
      ) : (
        <span className="text-sm text-slate-800">{value != null ? `${value}${max ? ` / ${max}` : ''}` : '-'}</span>
      )}
    </div>
  );
}

function EditableArrayRow({
  label,
  value,
  editing,
  onChange,
}: {
  label: string;
  value?: string[];
  editing: boolean;
  onChange: (v: string[]) => void;
}) {
  const text = (value || []).join('\n');
  return (
    <div className="grid gap-1 grid-cols-1">
      <span className="text-xs font-bold text-slate-500 pt-1">{label}（1行に1つ）</span>
      {editing ? (
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value.split('\n').filter((s) => s.trim() !== ''))}
          rows={3}
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 leading-relaxed"
        />
      ) : (
        <span className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">
          {value && value.length > 0 ? value.join('、') : '-'}
        </span>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
      <div className="flex justify-center mb-3">{icon}</div>
      <h3 className="text-sm font-black text-slate-700 mb-1">{title}</h3>
      <p className="text-xs text-slate-500">{description}</p>
    </div>
  );
}
