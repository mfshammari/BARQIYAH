import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventBalance, Guest } from '@/lib/types';

export const EMPTY_BALANCE: EventBalance = {
  seats_quota: 0, held: 0, confirmed: 0, available: 0,
  messages_used: 0, total_guests: 0,
  cnt_draft: 0, cnt_sent: 0, cnt_accepted: 0,
  cnt_declined: 0, cnt_expired: 0, cnt_attended: 0,
};

/** يقرأ رصيد المناسبة من دالة قاعدة البيانات (المصدر الوحيد للحقيقة). */
export async function fetchEventBalance(
  supabase: SupabaseClient,
  eventId: string,
): Promise<EventBalance> {
  const { data, error } = await supabase.rpc('event_balance', { p_event_id: eventId });
  if (error || !data || (Array.isArray(data) && data.length === 0)) return EMPTY_BALANCE;
  const row = Array.isArray(data) ? data[0] : data;
  return { ...EMPTY_BALANCE, ...(row as EventBalance) };
}

/**
 * حساب الرصيد محلياً من قائمة المدعوين — للعرض الفوري في الواجهة.
 * يطابق منطق دالة event_balance تماماً.
 */
export function computeBalance(guests: Guest[], seatsQuota: number): EventBalance {
  const held = guests
    .filter((g) => g.status === 'sent')
    .reduce((s, g) => s + g.max_seats, 0);
  const confirmed = guests
    .filter((g) => g.status === 'accepted' || g.status === 'attended')
    .reduce((s, g) => s + (g.confirmed_seats ?? 0), 0);

  const count = (st: Guest['status']) => guests.filter((g) => g.status === st).length;

  return {
    seats_quota: seatsQuota,
    held,
    confirmed,
    available: seatsQuota - held - confirmed,
    messages_used: guests.filter((g) => g.status !== 'draft').length,
    total_guests: guests.length,
    cnt_draft: count('draft'),
    cnt_sent: count('sent'),
    cnt_accepted: count('accepted'),
    cnt_declined: count('declined'),
    cnt_expired: count('expired'),
    cnt_attended: count('attended'),
  };
}

/** نسبة الاستهلاك (مؤكّد + محجوز) من إجمالي الباقة. */
export function usageRatio(b: EventBalance): number {
  if (!b.seats_quota) return 0;
  return Math.min(100, Math.round(((b.held + b.confirmed) / b.seats_quota) * 100));
}
