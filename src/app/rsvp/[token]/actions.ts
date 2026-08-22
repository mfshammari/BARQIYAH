'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { sendQrToGuest } from '@/lib/invitations';

export interface RsvpState { error?: string; notice?: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REASONS: Record<string, string> = {
  NOT_FOUND: 'الدعوة غير موجودة أو انتهت صلاحيتها.',
  NOT_SENT: 'لم تُرسل هذه الدعوة بعد.',
  INVALID_SEATS: 'عدد الحاضرين يتجاوز المسموح في دعوتك.',
  ALREADY_ATTENDED: 'تم تسجيل حضوركم بالفعل — لا يمكن تعديل الرد.',
};

/** تأكيد الحضور بعدد فعلي، ثم إرسال الباركود عبر واتساب. */
export async function acceptRsvp(_prev: RsvpState, formData: FormData): Promise<RsvpState> {
  const token = String(formData.get('token') ?? '');
  const seats = Number(formData.get('seats') ?? 0);

  if (!UUID_RE.test(token)) return { error: 'رابط الدعوة غير صالح.' };
  if (!Number.isInteger(seats) || seats < 1) return { error: 'اختر عدد الحاضرين.' };
  if (!adminClientAvailable) return { error: 'الخدمة غير متاحة حالياً. حاول لاحقاً.' };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('rsvp_accept', { p_token: token, p_seats: seats });

  if (error) return { error: 'تعذّر تسجيل التأكيد. حاول مرة أخرى.' };
  const res = data as { ok: boolean; reason?: string; guest_id?: string } | null;
  if (!res?.ok) return { error: REASONS[res?.reason ?? ''] ?? 'تعذّر تسجيل التأكيد.' };

  if (res.guest_id) await sendQrToGuest(res.guest_id);

  revalidatePath(`/rsvp/${token}`);
  return { notice: 'تم تأكيد حضوركم، وأُرسل الباركود عبر واتساب.' };
}

/** الاعتذار — يحرّر المقاعد المحجوزة فوراً. */
export async function declineRsvp(_prev: RsvpState, formData: FormData): Promise<RsvpState> {
  const token = String(formData.get('token') ?? '');
  if (!UUID_RE.test(token)) return { error: 'رابط الدعوة غير صالح.' };
  if (!adminClientAvailable) return { error: 'الخدمة غير متاحة حالياً. حاول لاحقاً.' };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('rsvp_decline', { p_token: token });

  if (error) return { error: 'تعذّر تسجيل الاعتذار. حاول مرة أخرى.' };
  const res = data as { ok: boolean; reason?: string } | null;
  if (!res?.ok) return { error: REASONS[res?.reason ?? ''] ?? 'تعذّر تسجيل الاعتذار.' };

  revalidatePath(`/rsvp/${token}`);
  return { notice: 'شكراً لإبلاغنا. سجّلنا اعتذاركم.' };
}
