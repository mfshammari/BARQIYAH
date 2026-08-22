// أنواع قاعدة البيانات (مطابقة للـ migrations)

export type UserRole = 'admin' | 'owner' | 'scanner';
export type EventStatus = 'pending' | 'active' | 'closed';
export type TemplateStatus = 'draft' | 'under_review' | 'approved' | 'rejected';
export type WhatsAppCategory = 'marketing' | 'utility';
export type GuestStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired' | 'attended';
export type TransactionType = 'purchase' | 'upgrade' | 'manual_activation';
export type TransactionStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type OccasionType = 'wedding' | 'engagement' | 'graduation' | 'other';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
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
  event_date: string;
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
  name: string;
  role_label: string;
  created_at: string;
}

export interface Guest {
  id: string;
  event_id: string;
  inviter_id: string | null;
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

export interface Transaction {
  id: string;
  event_id: string;
  package_id: string | null;
  amount: number;
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
  graduation: 'حفل تخرّج',
  other: 'مناسبة أخرى',
};

export const GUEST_STATUS_LABELS: Record<GuestStatus, string> = {
  draft: 'مسودة',
  sent: 'بانتظار الرد',
  accepted: 'أكّد الحضور',
  declined: 'اعتذر',
  expired: 'لم يرد',
  attended: 'حضر',
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
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
