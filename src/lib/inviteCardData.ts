import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildInviteCardSvg } from '@/lib/inviteCard';
import { formatHijri, formatTime, formatWeekday } from '@/lib/format';
import type { EventRow, ImageMode, Inviter } from '@/lib/types';

export type CardKind = 'event' | 'inviter';

export interface InviteCardSource {
  event: EventRow;
  /** متغيّرا القالب الموحّد لصاحب البطاقة (المالك أو الداعي) */
  vars: { host?: string; occasion?: string };
  imageMode: ImageMode;
  imageUrl: string | null;
}

/**
 * يقرأ المناسبة ومتغيّرات صاحب البطاقة (المالك أو الداعي) بمفتاح الخدمة —
 * مشترك بين مسار البطاقة المولَّدة ومسار صورة معاينة الرابط.
 */
export async function loadInviteCardSource(
  admin: SupabaseClient, kind: CardKind, id: string,
): Promise<InviteCardSource | null> {
  if (kind === 'event') {
    const { data } = await admin.from('events').select('*').eq('id', id).maybeSingle<EventRow>();
    if (!data) return null;
    return {
      event: data,
      vars: (data.invite_vars ?? {}) as InviteCardSource['vars'],
      imageMode: data.image_mode,
      imageUrl: data.image_url,
    };
  }
  const { data: inviter } = await admin.from('inviters').select('*').eq('id', id).maybeSingle<Inviter>();
  if (!inviter) return null;
  const { data: event } = await admin.from('events').select('*').eq('id', inviter.event_id).maybeSingle<EventRow>();
  if (!event) return null;
  return {
    event,
    vars: (inviter.invite_vars ?? {}) as InviteCardSource['vars'],
    imageMode: inviter.image_mode,
    imageUrl: inviter.image_url,
  };
}

/** SVG بطاقة برقية من بيانات المصدر. */
export function inviteCardSvg(src: InviteCardSource): string {
  const { event, vars } = src;
  const weekday = event.event_weekday || formatWeekday(event.event_date);
  const hijri = event.event_date_hijri || formatHijri(event.event_date);
  return buildInviteCardSvg({
    host: vars.host?.trim() || event.host_name,
    occasion: vars.occasion?.trim() || '',
    dateLine: [weekday, hijri].filter(Boolean).join(' '),
    venue: event.venue,
    time: formatTime(event.event_time) || null,
  });
}
