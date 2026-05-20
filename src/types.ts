export interface RecurringSchedule {
  daysOfWeek: number[]; // 0-6 (Sun-Sat)
  startTime: string;
  endTime: string;
  careType: '身体介護' | '生活援助' | '身体・生活' | 'その他';
  frequency: 'weekly' | 'biweekly_even' | 'biweekly_odd';
}

export interface Client {
  id: string;
  name: string;
  furigana?: string;
  birthDate: string; // YYYY-MM-DD
  age?: number;
  gender?: 'male' | 'female' | 'other';
  address?: string;
  notes?: string;
  recurringSchedules?: RecurringSchedule[];
  createdAt: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff';
  phone?: string;
  assignedAreas?: string[];
  status?: 'active' | 'inactive';
  createdAt: string;
}

export interface VitalSigns {
  temperature?: number;
  bloodPressureHigh?: number;
  bloodPressureLow?: number;
  pulse?: number;
  spo2?: number;
  faceColor?: 'good' | 'bad';
  sweating?: 'none' | 'exists';
}

export interface MealInfo {
  mainDish?: number; // 0-10
  sideDish?: number; // 0-10
  fluid?: number; // ml
  mealCare?: boolean;
  fluidCare?: boolean;
}

export interface ExcretionInfo {
  urinationCount?: number;
  urinationAmount?: string;
  defecationCount?: number;
  defecationStatus?: string;
  toiletCare?: boolean;
  diaperChange?: boolean;
  padChange?: boolean;
  genitalCleaning?: boolean;
  notes?: string;
}

export interface PhysicalCare {
  hygiene: {
    wipingFull?: boolean;
    wipingPartial?: boolean;
    bathing?: boolean;
    hairWash?: boolean;
    oralCare?: boolean;
  };
  movement: {
    positioning?: boolean;
    transfer?: boolean;
    dressing?: boolean;
  };
}

export interface LifeSupport {
  cleaning: {
    room?: boolean;
    toilet?: boolean;
    kitchen?: boolean;
    bath?: boolean;
    pToilet?: boolean;
    garbage?: boolean;
  };
  laundry: {
    wash?: boolean;
    dry?: boolean;
    storage?: boolean;
    ironing?: boolean;
  };
  cooking: {
    prep?: boolean;
    cook?: boolean;
    serving?: boolean;
    menu?: string;
  };
  shopping: {
    daily?: boolean;
    medicine?: boolean;
  };
}

export interface OtherServices {
  medication: {
    support?: boolean;
    application?: boolean;
    eyeDrops?: boolean;
  };
  medical: {
    suction?: boolean;
    enema?: boolean;
    prepCleanup?: boolean;
  };
  selfReliance: {
    housework?: boolean;
    dementiaCare?: boolean;
    fallPrevention?: boolean;
  };
}

export interface MoneyManagement {
  deposit?: number;
  totalSpent?: number;
  change?: number;
  details?: string;
}

export interface ExitCheck {
  fire?: boolean;
  electricity?: boolean;
  water?: boolean;
  locking?: boolean;
}

export interface CareRecord {
  id: string;
  clientId: string;
  caregiverId: string;
  date: string;
  startTime: string;
  endTime: string;
  serviceType: '訪問介護' | '障害福祉' | '移動支援' | '制度外';
  careType: '身体介護' | '生活援助' | '身体・生活' | 'その他';
  vitalSigns: VitalSigns;
  mealInfo: MealInfo;
  excretionInfo: ExcretionInfo;
  physicalCare: PhysicalCare;
  lifeSupport: LifeSupport;
  otherServices: OtherServices;
  moneyManagement: MoneyManagement;
  exitCheck: ExitCheck;
  generalNotes: string;
  signature?: string; // base64
  oralConsent?: boolean;
  createdAt: string;
}


export interface Schedule {
  id: string;
  clientId: string;
  caregiverId: string;
  date: string;
  startTime: string;
  endTime: string;
  careType: '身体介護' | '生活援助' | '身体・生活' | 'その他';
  status: 'planned' | 'scheduled' | 'completed' | 'cancelled';
}

export interface CarePlan {
  id: string;
  clientId: string;
  clientName: string;
  caregiverId: string;
  careLevel: string;
  period: string; // 認定の有効期間
  currentService: string;
  goals: string[];
  createdAt: string;
}

export interface GoalStatus {
  goalText: string;
  evaluation: '達成' | 'やや達成' | '維持' | 'やや後退' | '後退';
  basis: string;
}

export interface MonitoringReport {
  id: string;
  clientId: string;
  clientName: string;
  monitoringDate: string;
  manager: string; // サービス提供責任者
  careLevel: string;
  period: string;
  currentService: string;
  goalsStatus: GoalStatus[];
  alongHomePlan: 'している' | 'していない';
  alongCarePlan: 'している' | 'していない';
  needRevision: 'あり' | 'なし';
  satisfactionClient: '満足' | 'ほぼ満足' | 'やや不満' | '不満';
  satisfactionFamily: '達成' | 'やや達成' | '維持' | 'やや後退' | '後退';
  additionalNotes: string;
  explainedDate: string;
  explainedAuthor: string;
  officeName: string;
  createdAt: string;
}

export interface ConferenceReply {
  id: string;
  clientId: string;
  clientName: string;
  subject: string;
  inquiryText: string;
  replyText: string;
  creatorName: string;
  createdAt: string;
}


