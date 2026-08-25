import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { appUrl } from '@/lib/env';
import { buildButtonPayloads, buildSeatsPayload, getWhatsAppProvider } from '@/lib/whatsapp';
import { OCCASION_LABELS, type EventRow, type Guest, type Template } from '@/lib/types';
import { formatDate, formatEventLine } from '@/lib/format';
import { renderInvite, type InviteVars } from '@/lib/inviteVars';


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

/** إرسال باسم داعٍ: بحصته ونصّه وصورته وقالبه. */
export interface InviterContext {
  inviterId: string;
  inviteVars: InviteVars;
  imageUrl: string | null;
  templateId: string;
  reasons?: Record<string, string>;
}

/**
 * إرسال دعوات: يحجز المقاعد ذرّياً في قاعدة البيانات أولاً،
 * ثم يرسل عبر واتساب، ويحرّر الحجز عند فشل الإرسال.
 *
 * مع سياق داعٍ: الحجز من حصته، والنص والصورة والقالب من اختياره —
 * وسطر الموعد والمكان يُحقن من بيانات المناسبة ولا يحرّره (SPEC §6).
 */
export async function sendInvitations(
  supabase: SupabaseClient,
  eventId: string,
  guestIds: string[],
  inviterCtx?: InviterContext,
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

  // 1) الحجز الذرّي — من حصة الداعي إن وُجد سياقه، وإلا من رصيد المناسبة
  const { data: reserved, error: reserveError } = inviterCtx
    ? await supabase.rpc('reserve_seats_for_inviter', {
        p_inviter_id: inviterCtx.inviterId,
        p_guest_ids: guestIds,
      })
    : await supabase.rpc('reserve_seats_for_send', {
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
    const reasons = { ...RESERVE_REASONS, ...(inviterCtx?.reasons ?? {}) };
    outcomes.push({
      guestId: row.guest_id,
      name: guestMap.get(row.guest_id)?.name ?? '',
      ok: false,
      reason: reasons[row.reason] ?? 'تعذّر الإرسال.',
      missingSeats: row.missing_seats || undefined,
    });
  }

  if (toSend.length === 0) return outcomes;

  // 2) الإرسال الفعلي
  const provider = await getWhatsAppProvider();

  // قالب الداعي إن وُجد، وإلا قالب المناسبة
  let activeTemplate = template;
  if (inviterCtx && inviterCtx.templateId !== event.template_id) {
    const { data: t } = await supabase
      .from('templates').select('*').eq('id', inviterCtx.templateId).maybeSingle<Template>();
    if (t) activeTemplate = t;
  }

  const templateName = activeTemplate?.meta_template_name || 'barqiyah_invite_default';

  // سطر الموعد والمكان: من حقول المناسبة وحدها، مصدره واحد لكل الدعاة
  const eventLine = formatEventLine({
    dateGregorian: event.event_date,
    dateHijri: event.event_date_hijri,
    weekday: event.event_weekday,
    time: event.event_time,
    venue: event.venue,
  });

  const bodyParams = inviterCtx
    ? [inviterCtx.inviteVars.host, inviterCtx.inviteVars.occasion, eventLine]
    : buildBodyParams(event, activeTemplate);

  const headerImage = inviterCtx?.imageUrl ?? event.image_url ?? activeTemplate?.image_url ?? null;

  for (const row of toSend) {
    const guest = guestMap.get(row.guest_id);
    if (!guest) continue;

    const result = await provider.sendTemplate({
      to: guest.phone,
      templateName,
      languageCode: 'ar',
      headerImageUrl: headerImage,
      bodyParams,
      buttonPayloads: buildButtonPayloads(guest.invite_token),
    });

    await logMessage({
      event_id: eventId, guest_id: guest.id, kind: 'invitation',
      inviter_id: inviterCtx?.inviterId ?? guest.inviter_id ?? null,
      template_name: templateName,
      meta_message_id: result.messageId ?? null,
      provider: result.provider, to_phone: guest.phone,
      status: result.ok ? 'sent' : 'failed',
      message_id: result.messageId ?? null, error: result.error ?? null,
      payload: {
        rendered: inviterCtx ? renderInvite(inviterCtx.inviteVars, eventLine) : null,
        rsvp_url: appUrl(`/rsvp/${guest.invite_token}`),
        body_params: bodyParams,
      },
    });

    if (result.ok) {
      outcomes.push({ guestId: guest.id, name: guest.name, ok: true });
    } else {
      // تحرير الحجز حتى لا يُستهلك الرصيد على رسالة لم تصل
      if (inviterCtx) {
        await supabase.rpc('release_inviter_hold', { p_guest_id: guest.id });
      } else {
        await supabase.rpc('release_seat_hold', { p_guest_id: guest.id });
      }
      outcomes.push({
        guestId: guest.id, name: guest.name, ok: false,
        reason: result.error ? `فشل الإرسال: ${result.error}` : 'فشل الإرسال عبر واتساب.',
      });
    }
  }

  return outcomes;
}

/**
 * بعد ضغط زر «تأكيد الحضور»: نسأل المدعو عن العدد الفعلي.
 * دعوة بمقعد واحد لا تحتاج سؤالاً. حتى ١٠ مقاعد نعرض قائمة تفاعلية داخل واتساب،
 * وما فوقها نرسل رابط صفحة الرد لأن Meta تحدّ القائمة بعشرة صفوف.
 */
export async function askForSeatCount(guestId: string): Promise<{ ok: boolean; error?: string }> {
  if (!adminClientAvailable) return { ok: false, error: 'service role غير مضبوط' };

  const admin = createAdminClient();
  const { data: guest } = await admin
    .from('guests').select('*').eq('id', guestId).maybeSingle<Guest>();
  if (!guest) return { ok: false, error: 'المدعو غير موجود' };

  const provider = await getWhatsAppProvider();
  const rsvpUrl = appUrl(`/rsvp/${guest.invite_token}`);

  const result = guest.max_seats <= 10
    ? await provider.sendList({
        to: guest.phone,
        header: 'تأكيد الحضور',
        body: 'كم عدد الحاضرين معكم؟ اختر العدد الفعلي من القائمة.',
        footer: `دعوتكم تتسع لـ ${guest.max_seats}`,
        buttonLabel: 'اختيار العدد',
        rows: Array.from({ length: guest.max_seats }, (_, i) => ({
          id: buildSeatsPayload(guest.invite_token, i + 1),
          title: `${i + 1}`,
          description: i === 0 ? 'شخص واحد' : `${i + 1} أشخاص`,
        })),
      })
    : await provider.sendText({
        to: guest.phone,
        text:
          `شكراً لتأكيدكم. حدّدوا عدد الحاضرين الفعلي من هذا الرابط ` +
          `(الحد الأقصى ${guest.max_seats}):\n${rsvpUrl}`,
      });

  await logMessage({
    event_id: guest.event_id, guest_id: guest.id, kind: 'seat_prompt',
    provider: result.provider, to_phone: guest.phone,
    status: result.ok ? 'sent' : 'failed',
    message_id: result.messageId ?? null, error: result.error ?? null,
    payload: { max_seats: guest.max_seats, rsvp_url: rsvpUrl },
  });

  return { ok: result.ok, error: result.error };
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

/* ============================================================
   التذكير — رسالة واحدة لمن لم يردّ (SPEC §4.1)
   ============================================================ */

export interface ReminderOutcome {
  sent: number;
  failed: number;
  /** لم يكن هناك مؤهّل أصلاً */
  none: boolean;
}

/**
 * تذكير من لم يردّ. الاستحقاق والقيد «مرة واحدة» محسومان في القاعدة:
 * `mark_reminders_sent` تقفل الصفوف وتضبط `reminded_at` وترجع من
 * عُلِّم فعلاً — فالضغط مرّتين لا يذكّر أحداً مرّتين.
 *
 * التذكير لا يغيّر الحالة ولا يحرّر المقاعد: المدعو يبقى `sent`.
 * مع `inviterId` يقتصر على مدعوّي ذلك الداعي وحده.
 */
export async function sendReminders(
  supabase: SupabaseClient,
  eventId: string,
  inviterId?: string,
): Promise<ReminderOutcome> {
  const { data: event } = await supabase
    .from('events').select('*').eq('id', eventId).maybeSingle<EventRow>();
  if (!event) return { sent: 0, failed: 0, none: true };

  // التعليم أولاً: من عُلِّم هنا هو من نرسل له — لا أحد غيره
  const { data: marked, error } = await supabase.rpc('mark_reminders_sent', {
    p_event_id: eventId,
    p_inviter_id: inviterId ?? null,
  });

  if (error) return { sent: 0, failed: 0, none: true };

  const due = (marked ?? []) as {
    guest_id: string; name: string; phone: string; max_seats: number; inviter_id: string | null;
  }[];
  if (due.length === 0) return { sent: 0, failed: 0, none: true };

  const eventLine = formatEventLine({
    dateGregorian: event.event_date,
    dateHijri: event.event_date_hijri,
    weekday: event.event_weekday,
    time: event.event_time,
    venue: event.venue,
  });

  const provider = await getWhatsAppProvider();
  let sent = 0;
  let failed = 0;

  for (const g of due) {
    const text =
      `تذكير بدعوة ${event.host_name} — ${eventLine}.\n` +
      'هل ستشرّفنا بالحضور؟ ردّ بـ«نعم» أو «أعتذر».';

    const res = await provider.sendText({ to: g.phone, text });
    if (res.ok) sent += 1;
    else failed += 1;

    await logMessage({
      event_id: eventId,
      guest_id: g.guest_id,
      direction: 'outbound',
      template_name: 'reminder',
      meta_message_id: res.messageId ?? null,
      status: res.ok ? 'sent' : 'failed',
      error_code: res.ok ? null : (res.error ?? 'SEND_FAILED'),
    });
  }

  return { sent, failed, none: false };
}
