import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { appUrl } from '@/lib/env';
import { buildButtonPayloads, getWhatsAppProvider } from '@/lib/whatsapp';
import { OCCASION_LABELS, type EventRow, type Guest, type Template } from '@/lib/types';
import { formatDate } from '@/lib/format';

export interface SendOutcome {
  guestId: string;
  name: string;
  ok: boolean;
  /** سبب مقروء بالعربية عند الفشل */
  reason?: string;
  missingSeats?: number;
}

interface ReserveRow {
  guest_id: string;
  ok: boolean;
  reason: string;
  missing_seats: number;
}

const RESERVE_REASONS: Record<string, string> = {
  EVENT_NOT_ACTIVE: 'المناسبة غير مفعّلة — تواصل مع الإدارة لتفعيل الباقة.',
  GUEST_NOT_FOUND: 'المدعو غير موجود.',
  ALREADY_SENT: 'الدعوة مُرسلة مسبقاً.',
  INSUFFICIENT_SEATS: 'الرصيد لا يكفي لحجز مقاعد هذه الدعوة.',
};

/** سطر سجل الرسائل — يُكتب بـ service role حتى لا تحجبه سياسات RLS. */
async function logMessage(row: Record<string, unknown>) {
  if (!adminClientAvailable) return;
  try {
    await createAdminClient().from('message_logs').insert(row);
  } catch {
    /* السجل ثانوي — لا يوقف الإرسال */
  }
}

function buildBodyParams(event: EventRow, template: Template | null): string[] {
  // {{1}} اسم المُضيف — {{2}} أصحاب المناسبة — {{3}} التاريخ — {{4}} نوع المناسبة
  const params = [
    event.host_name,
    event.buyer_name || event.host_name,
    formatDate(event.event_date),
    OCCASION_LABELS[event.occasion_type],
  ];
  // نمرّر بقدر ما يطلبه نص القالب فقط
  const needed = template ? countPlaceholders(template.body_text) : params.length;
  return params.slice(0, Math.max(needed, 1));
}

export function countPlaceholders(body: string): number {
  const found = new Set(Array.from(body.matchAll(/\{\{(\d+)\}\}/g)).map((m) => m[1]));
  return found.size;
}

/**
 * إرسال دعوات: يحجز المقاعد ذرّياً في قاعدة البيانات أولاً،
 * ثم يرسل عبر واتساب، ويحرّر الحجز عند فشل الإرسال.
 */
export async function sendInvitations(
  supabase: SupabaseClient,
  eventId: string,
  guestIds: string[],
): Promise<SendOutcome[]> {
  if (guestIds.length === 0) return [];

  const { data: event } = await supabase
    .from('events').select('*').eq('id', eventId).maybeSingle<EventRow>();
  if (!event) return guestIds.map((id) => ({ guestId: id, name: '', ok: false, reason: 'المناسبة غير موجودة.' }));

  const { data: template } = event.template_id
    ? await supabase.from('templates').select('*').eq('id', event.template_id).maybeSingle<Template>()
    : { data: null as Template | null };

  const { data: guests } = await supabase
    .from('guests').select('*').in('id', guestIds).eq('event_id', eventId)
    .returns<Guest[]>();
  const guestMap = new Map((guests ?? []).map((g) => [g.id, g]));

  // 1) الحجز الذرّي
  const { data: reserved, error: reserveError } = await supabase.rpc('reserve_seats_for_send', {
    p_event_id: eventId,
    p_guest_ids: guestIds,
  });

  if (reserveError) {
    const msg = reserveError.message.includes('FORBIDDEN')
      ? 'لا تملك صلاحية الإرسال لهذه المناسبة.'
      : 'تعذّر حجز المقاعد. حاول مرة أخرى.';
    return guestIds.map((id) => ({
      guestId: id, name: guestMap.get(id)?.name ?? '', ok: false, reason: msg,
    }));
  }

  const rows = (reserved ?? []) as ReserveRow[];
  const outcomes: SendOutcome[] = [];
  const toSend: ReserveRow[] = [];

  for (const row of rows) {
    if (row.ok) { toSend.push(row); continue; }
    outcomes.push({
      guestId: row.guest_id,
      name: guestMap.get(row.guest_id)?.name ?? '',
      ok: false,
      reason: RESERVE_REASONS[row.reason] ?? 'تعذّر الإرسال.',
      missingSeats: row.missing_seats || undefined,
    });
  }

  if (toSend.length === 0) return outcomes;

  // 2) الإرسال الفعلي
  const provider = await getWhatsAppProvider();
  const templateName = template?.meta_template_name || 'barqiyah_invite_default';
  const bodyParams = buildBodyParams(event, template);

  for (const row of toSend) {
    const guest = guestMap.get(row.guest_id);
    if (!guest) continue;

    const result = await provider.sendTemplate({
      to: guest.phone,
      templateName,
      languageCode: 'ar',
      headerImageUrl: event.image_url ?? template?.image_url ?? null,
      bodyParams,
      buttonPayloads: buildButtonPayloads(guest.invite_token),
    });

    await logMessage({
      event_id: eventId, guest_id: guest.id, kind: 'invitation',
      provider: result.provider, to_phone: guest.phone,
      status: result.ok ? 'sent' : 'failed',
      message_id: result.messageId ?? null, error: result.error ?? null,
      payload: {
        template: templateName,
        rsvp_url: appUrl(`/rsvp/${guest.invite_token}`),
        body_params: bodyParams,
      },
    });

    if (result.ok) {
      outcomes.push({ guestId: guest.id, name: guest.name, ok: true });
    } else {
      // تحرير الحجز حتى لا يُستهلك الرصيد على رسالة لم تصل
      await supabase.rpc('release_seat_hold', { p_guest_id: guest.id });
      outcomes.push({
        guestId: guest.id, name: guest.name, ok: false,
        reason: result.error ? `فشل الإرسال: ${result.error}` : 'فشل الإرسال عبر واتساب.',
      });
    }
  }

  return outcomes;
}

/**
 * إرسال الباركود للمدعو بعد تأكيده.
 * رسالة صورة حرّة داخل نافذة الخدمة (24 ساعة) لأن التأكيد فتحها للتو.
 * TODO: confirm with owner — هل نستخدم قالباً مدفوعاً منفصلاً بدل الرسالة الحرّة؟
 */
export async function sendQrToGuest(guestId: string): Promise<{ ok: boolean; error?: string }> {
  if (!adminClientAvailable) return { ok: false, error: 'service role غير مضبوط' };

  const admin = createAdminClient();
  const { data: guest } = await admin
    .from('guests').select('*').eq('id', guestId).maybeSingle<Guest>();
  if (!guest?.qr_token) return { ok: false, error: 'لا يوجد رمز للمدعو' };

  const { data: event } = await admin
    .from('events').select('*').eq('id', guest.event_id).maybeSingle<EventRow>();

  const pageUrl = appUrl(`/i/${guest.qr_token}`);
  const imageUrl = appUrl(`/api/qr/${guest.qr_token}`);
  const seats = guest.confirmed_seats ?? 1;

  const provider = await getWhatsAppProvider();
  const caption =
    `تم تأكيد حضوركم — ${event?.host_name ?? ''}\n` +
    `عدد المقاعد: ${seats}\n` +
    `يُرجى إظهار هذا الرمز عند البوابة.\n${pageUrl}`;

  const result = await provider.sendImage({ to: guest.phone, imageUrl, caption });

  await logMessage({
    event_id: guest.event_id, guest_id: guest.id, kind: 'qr',
    provider: result.provider, to_phone: guest.phone,
    status: result.ok ? 'sent' : 'failed',
    message_id: result.messageId ?? null, error: result.error ?? null,
    payload: { page_url: pageUrl, image_url: imageUrl, seats },
  });

  return { ok: result.ok, error: result.error };
}
