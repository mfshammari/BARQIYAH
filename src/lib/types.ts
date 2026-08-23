// أنواع قاعدة البيانات (مطابقة للـ migrations)

export type UserRole =
  | 'admin'            // متوافق مع v1
  | 'admin_owner' | 'admin_support' | 'admin_reviewer' | 'admin_finance'
  | 'user'             // العميل: حساب دائم يجمع مناسباته
  | 'owner'            // متوافق مع v1 (يعادل user)
  | 'scanner';
export type EventStatus = 'pending' | 'unpaid' | 'active' | 'closed';
export type TemplateStatus = 'draft' | 'under_review' | 'approved' | 'rejected';
export type WhatsAppCategory = 'marketing' | 'utility';
export type GuestStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'attended' | 'failed';
export type TransactionType = 'purchase' | 'upgrade' | 'manual_activation';
export type TransactionStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type OccasionType =
  | 'wedding' | 'engagement' | 'engagement_contract'
  | 'graduation' | 'newborn' | 'official' | 'other';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
  /** إيقاف إرسال العميل مؤقتاً — حماية الرقم المشترك (SPEC §6) */
  sending_paused: boolean;
  paused_reason: string | null;
  created_at: string;
}

export interface Package {
  id: string;
  name: string;
  seats: number;
  price: number;
  active: boolean;
  created_at: string;
}

export interface Template {
  id: string;
  owner_id: string | null;
  name: string;
  body_text: string;
  image_url: string | null;
  status: TemplateStatus;
  rejection_reason: string | null;
  whatsapp_category: WhatsAppCategory;
  meta_template_name: string | null;
  created_at: string;
}

export interface EventRow {
  id: string;
  owner_id: string;
  package_id: string | null;
  occasion_type: OccasionType;
  /** التاريخ الميلادي (event_date_gregorian في المواصفة) */
  event_date: string;
  event_date_hijri: string | null;
  event_weekday: string | null;
  event_time: string | null;
  venue: string | null;
  /** اسم داخلي يميّز المناسبة في قائمة العميل */
  internal_name: string | null;
  /** صاحب المناسبة الأول — العريس/الخاطب/الخرّيج… حسب النوع */
  celebrant_primary: string | null;
  /** العروس — في الزواج فقط */
  celebrant_secondary: string | null;
  activated_at: string | null;
  activated_by: string | null;
  /** الجهة الداعية كما تظهر في نص الدعوة */
  host_name: string;
  buyer_name: string | null;
  buyer_phone: string | null;
  template_id: string | null;
  image_url: string | null;
  seats_quota: number;
  status: EventStatus;
  created_at: string;
}

export interface Inviter {
  id: string;
  event_id: string;
  /** حساب الداعي — الداعي ليس دوراً بل صفة داخل مناسبة (SPEC §3) */
  profile_id: string | null;
  name: string;
  phone: string | null;
  role_label: string;
  /** أهل العريس / أهل العروس / … */
  side_label: string | null;
  /** حصته من مقاعد المناسبة */
  seats_quota: number;
  /** القالب الذي اختاره بنفسه */
  template_id: string | null;
  /** المتغيّرات التي كتبها بحرية */
  invite_vars: Record<string, string>;
  image_url: string | null;
  invite_token: string;
  joined_at: string | null;
  created_at: string;
}

export interface Contact {
  id: string;
  owner_id: string;
  name: string;
  phone: string;
  group_label: string | null;
  notes: string | null;
  created_at: string;
}

export interface ContactGroup {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  /** فارغ = النظام (مثل التفعيل التلقائي بعد الدفع) */
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Guest {
  id: string;
  event_id: string;
  inviter_id: string | null;
  contact_id: string | null;
  failure_reason: string | null;
  name: string;
  phone: string;
  max_seats: number;
  confirmed_seats: number | null;
  status: GuestStatus;
  invite_token: string;
  qr_token: string | null;
  scans_used: number;
  sent_at: string | null;
  responded_at: string | null;
  attended_at: string | null;
  created_at: string;
}

export interface Scanner {
  id: string;
  event_id: string;
  profile_id: string;
  label: string;
  created_at: string;
}

export interface IntegrationSettings {
  id: string;
  phone_number_id: string | null;
  waba_id: string | null;
  access_token: string | null;
  verify_token: string | null;
  updated_at: string;
}

export type PaymentMethod = 'gateway' | 'bank_transfer' | 'manual';

export interface Transaction {
  id: string;
  event_id: string;
  package_id: string | null;
  amount: number;
  method: PaymentMethod;
  gateway_ref: string | null;
  paid_at: string | null;
  type: TransactionType;
  status: TransactionStatus;
  seats_added: number;
  note: string | null;
  created_at: string;
}

export interface MessageLog {
  id: string;
  event_id: string | null;
  guest_id: string | null;
  kind: string;
  provider: string;
  to_phone: string | null;
  status: string;
  message_id: string | null;
  error: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

/** ناتج دالة event_balance في قاعدة البيانات */
export interface EventBalance {
  seats_quota: number;
  held: number;
  confirmed: number;
  available: number;
  messages_used: number;
  total_guests: number;
  cnt_draft: number;
  cnt_sent: number;
  cnt_accepted: number;
  cnt_declined: number;
  cnt_expired: number;
  cnt_attended: number;
}

export const OCCASION_LABELS: Record<OccasionType, string> = {
  wedding: 'حفل زواج',
  engagement: 'حفل خطوبة',
  engagement_contract: 'عقد قران',
  graduation: 'حفل تخرّج',
  newborn: 'مولود جديد',
  official: 'مناسبة رسمية',
  other: 'مناسبة أخرى',
};

/** عنوان خانة «صاحب المناسبة» يتبدّل حسب النوع (SPEC §3). */
export const CELEBRANT_LABELS: Record<OccasionType, string> = {
  wedding: 'العريس',
  engagement: 'الخاطب',
  engagement_contract: 'العريس',
  graduation: 'الخرّيج',
  newborn: 'المولود',
  official: 'الجهة',
  other: 'صاحب المناسبة',
};

/** الزواج وحده له خانتان (العريس والعروس). */
export function hasTwoCelebrants(occasion: OccasionType): boolean {
  return occasion === 'wedding';
}

export const GUEST_STATUS_LABELS: Record<GuestStatus, string> = {
  failed: 'فشل الإرسال',
  draft: 'مسودة',
  sent: 'بانتظار الرد',
  accepted: 'أكّد الحضور',
  declined: 'اعتذر',
  expired: 'لم يرد',
  attended: 'حضر',
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  unpaid: 'غير مدفوعة',
  pending: 'بانتظار التفعيل',
  active: 'مفعّلة',
  closed: 'مغلقة',
};

export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
  draft: 'مسودة',
  under_review: 'قيد المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  purchase: 'شراء',
  upgrade: 'ترقية',
  manual_activation: 'تفعيل يدوي',
};
