/**
 * الإرسال اليدوي عبر واتساب — الأنواع المشتركة بين اللوحة وصفحة المدعو.
 *
 * مسار مؤقّت إلى أن يكتمل ربط WhatsApp Cloud API: الداعي يرسل كل دعوة من
 * واتساب جواله برابط click-to-chat، والرسالة تحمل رابط المدعو الخاص الذي
 * يردّ منه بالسيناريو نفسه الذي سيتّبعه البوت لاحقاً.
 */

export type GuestStatus = 'draft' | 'pending' | 'opened' | 'confirmed' | 'declined' | 'attended';

/** باسم من تصدر الدعوة: الاثنين / صاحب المناسبة / الداعي الفرعي */
export type SignBy = 'both' | 'owner' | 'sub';

/** صفة المستخدم الحالي في اللوحة */
export type Viewer = 'owner' | 'sub';

export interface Guest {
  id: string;
  /** رمز خاص لا يُخمَّن (٨ محارف عشوائية فأكثر) — هو رابط المدعو */
  token: string;
  name: string;
  /** بصيغة E.164 مع علامة + مثل +9665xxxxxxxx */
  phoneE164: string;
  maxSeats: number;
  status: GuestStatus;
  /** عدد الحضور الفعلي بعد التأكيد (صفر قبله) */
  attendees: number;
}

export interface EventInfo {
  id: string;
  title: string;
  occasion: string;
  ownerName: string;
  subInviterName: string | null;
  dateText: string;
  timeText: string;
  venue: string;
  mapUrl: string;
  packageSeats: number;
}

export interface MessageTemplate {
  id: string;
  name: string;
  text: string;
}

export interface Invitation {
  event: EventInfo;
  guest: Guest;
  signBy: SignBy;
}

export interface RsvpInput {
  attending: boolean;
  attendees: number;
}

export const GUEST_STATUS_LABELS: Record<GuestStatus, string> = {
  draft: 'مسودة',
  pending: 'بانتظار',
  opened: 'فتح الدعوة',
  confirmed: 'أكّد',
  declined: 'اعتذر',
  attended: 'حضر',
};

export const SIGN_BY_LABELS: Record<SignBy, string> = {
  both: 'الاثنين',
  owner: 'صاحب المناسبة',
  sub: 'الداعي الفرعي',
};
