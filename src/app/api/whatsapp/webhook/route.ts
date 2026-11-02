import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { getWebhookVerifyToken, parseWebhookEvents, parseButtonPayload } from '@/lib/whatsapp';
import { verifyMetaSignature, allowUnsignedWebhook } from '@/lib/whatsapp/signature';
import type { InboundReply, MessageStatusUpdate } from '@/lib/whatsapp/types';
import { askForSeatCount, sendQrToGuest } from '@/lib/invitations';
import { getWhatsAppProvider } from '@/lib/whatsapp';
import { normalizePhone } from '@/lib/format';
import { env } from '@/lib/env';
import type { Guest, MessageLog } from '@/lib/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** نافذة الربط بالرقم وحده: آخر دعوة أُرسلت لهذا الرقم خلال ٧ أيام. */
const PHONE_WINDOW_DAYS = 7;

/** التحقق من الـ webhook عند ربطه في لوحة Meta. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  const expected = await getWebhookVerifyToken();

  if (mode === 'subscribe' && expected && token === expected) {
    return new NextResponse(challenge ?? '', { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

/**
 * يحجز معرّف الحدث قبل معالجته: Meta تعيد الإرسال، فالصف الموجود يعني
 * «عولج من قبل» ويُتخطّى. للحالات المفتاح wamid:status.
 */
async function claimEvent(admin: SupabaseClient, key: string): Promise<boolean> {
  if (!key) return true;   // بلا معرّف لا سبيل للتمييز — نعالج
  const { data, error } = await admin
    .from('webhook_events')
    .upsert({ wamid: key }, { onConflict: 'wamid', ignoreDuplicates: true })
    .select('wamid');
  if (error) return true;  // جدول غير مرحّل بعد: لا نُسقط المعالجة
  return (data ?? []).length > 0;
}

/**
 * استقبال ردود المدعوين وحالات الرسائل:
 *   زر "تأكيد"  → دعوة بمقعد واحد تُؤكَّد فوراً، وأكثر من ذلك نسأل عن العدد الفعلي.
 *   قائمة العدد → تأكيد بالعدد المختار ثم إرسال الباركود.
 *   زر "اعتذار" → تحديث الحالة وتحرير المقاعد المحجوزة.
 *   failed      → المدعو failed مع السبب وتحرير الحجز؛ delivered/read → سجل الرسائل.
 *
 * التوقيع إلزامي (X-Hub-Signature-256)؛ بلا META_APP_SECRET يُقبل في التطوير فقط.
 * بعد نجاح التوقيع نرد دائماً بـ 200 حتى لا تعيد Meta الإرسال بلا نهاية.
 */
export async function POST(request: NextRequest) {
  // الجسم خاماً أولاً: التوقيع يُحسب على النص الأصلي حرفاً بحرف
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  const signed = verifyMetaSignature(rawBody, signature, env.metaAppSecret);
  if (!signed && !allowUnsignedWebhook(env.metaAppSecret, process.env.NODE_ENV)) {
    console.error('[whatsapp:webhook] توقيع غير صالح — طلب مرفوض');
    return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, ignored: 'invalid_json' });
  }

  if (!adminClientAvailable) {
    console.error('[whatsapp:webhook] SUPABASE_SERVICE_ROLE_KEY غير مضبوط — تعذّرت معالجة الرد');
    return NextResponse.json({ ok: true, ignored: 'service_role_missing' });
  }

  const { replies, statuses } = parseWebhookEvents(body);
  if (replies.length === 0 && statuses.length === 0) {
    return NextResponse.json({ ok: true, handled: 0 });
  }

  const admin = createAdminClient();
  let handled = 0;
  let skipped = 0;

  for (const reply of replies) {
    try {
      if (!(await claimEvent(admin, reply.messageId))) { skipped++; continue; }
      if (await handleReply(admin, reply)) handled++;
    } catch (err) {
      console.error('[whatsapp:webhook] فشل معالجة رد:', err);
    }
  }

  for (const st of statuses) {
    try {
      if (!(await claimEvent(admin, `${st.wamid}:${st.status}`))) { skipped++; continue; }
      if (await handleStatus(admin, st)) handled++;
    } catch (err) {
      console.error('[whatsapp:webhook] فشل معالجة حالة:', err);
    }
  }

  return NextResponse.json({ ok: true, handled, skipped });
}

/** إيجاد المدعو: context.id أولاً، ثم توكن الزر، والرقم وحده آخر خيار بنافذة ٧ أيام. */
async function findGuest(admin: SupabaseClient, reply: InboundReply): Promise<Guest | null> {
  if (reply.contextId) {
    const { data: log } = await admin
      .from('message_logs').select('guest_id')
      .eq('meta_message_id', reply.contextId).not('guest_id', 'is', null)
      .limit(1).maybeSingle<Pick<MessageLog, 'guest_id'>>();
    if (log?.guest_id) {
      const { data } = await admin.from('guests').select('*').eq('id', log.guest_id).maybeSingle<Guest>();
      if (data) return data;
    }
  }

  if (reply.buttonPayload) {
    const parsed = parseButtonPayload(reply.buttonPayload);
    if (parsed) {
      const { data } = await admin
        .from('guests').select('*').eq('invite_token', parsed.token).maybeSingle<Guest>();
      if (data) return data;
    }
  }

  const phone = normalizePhone(reply.from);
  const since = new Date(Date.now() - PHONE_WINDOW_DAYS * 86_400_000).toISOString();
  const { data } = await admin
    .from('guests').select('*')
    .eq('phone', phone)
    .in('status', ['sent', 'accepted'])
    .gte('sent_at', since)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle<Guest>();
  return data ?? null;
}

async function handleReply(admin: SupabaseClient, reply: InboundReply): Promise<boolean> {
  const guest = await findGuest(admin, reply);
  if (!guest) return false;

  await admin.from('message_logs').insert({
    event_id: guest.event_id, guest_id: guest.id, kind: 'reply', direction: 'inbound',
    provider: 'meta', to_phone: guest.phone, status: 'received',
    message_id: reply.messageId, meta_message_id: reply.messageId,
    payload: {
      kind: reply.kind, text: reply.text ?? null, button: reply.buttonPayload ?? null,
      context_id: reply.contextId ?? null,
    },
  });

  if (reply.kind === 'accept') {
    if (guest.max_seats === 1) {
      const { data: result } = await admin.rpc('rsvp_accept', { p_token: guest.invite_token, p_seats: 1 });
      return acceptOutcome(guest, result as { ok: boolean; reason?: string } | null);
    }
    await askForSeatCount(guest.id);
    return true;
  }

  if (reply.kind === 'seats' && reply.seats) {
    const { data: result } = await admin.rpc('rsvp_accept', { p_token: guest.invite_token, p_seats: reply.seats });
    return acceptOutcome(guest, result as { ok: boolean; reason?: string } | null);
  }

  if (reply.kind === 'decline') {
    const { data: result } = await admin.rpc('rsvp_decline', { p_token: guest.invite_token });
    return Boolean((result as { ok: boolean } | null)?.ok);
  }

  // رسالة نصية غير مفهومة: اكتفينا بتسجيلها
  return false;
}

/** بعد rsvp_accept: الباركود عند النجاح، ورسالة نصية عند اكتمال المقاعد. */
async function acceptOutcome(guest: Guest, res: { ok: boolean; reason?: string } | null): Promise<boolean> {
  if (res?.ok) {
    await sendQrToGuest(guest.id);
    return true;
  }
  if (res?.reason === 'INSUFFICIENT_SEATS') {
    const provider = await getWhatsAppProvider();
    await provider.sendText({
      to: guest.phone,
      text: 'تعذّر التأكيد — المقاعد اكتملت، تواصل مع من دعاك.',
    });
    return true;
  }
  return false;
}

/** الترتيب التصاعدي للحالات: لا نُنزل «قُرئت» إلى «وُصلت». */
const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 9 };

async function handleStatus(admin: SupabaseClient, st: MessageStatusUpdate): Promise<boolean> {
  const { data: log } = await admin
    .from('message_logs').select('*').eq('meta_message_id', st.wamid)
    .limit(1).maybeSingle<MessageLog>();
  if (!log) return false;

  if (st.status === 'failed') {
    await admin.from('message_logs')
      .update({ status: 'failed', error_code: st.errorCode ?? null, error: st.errorTitle ?? null })
      .eq('id', log.id);

    if (log.guest_id && log.kind === 'invitation') {
      const { data: guest } = await admin.from('guests').select('*').eq('id', log.guest_id).maybeSingle<Guest>();
      if (guest && guest.status === 'sent') {
        // تحرير الحجز أولاً (يعيد المدعو مسودة) ثم تعليم الفشل بسببه
        if (guest.inviter_id) await admin.rpc('release_inviter_hold', { p_guest_id: guest.id });
        else await admin.rpc('release_seat_hold', { p_guest_id: guest.id });

        await admin.from('guests').update({
          status: 'failed',
          failure_reason: [st.errorCode, st.errorTitle].filter(Boolean).join(' — ') || 'فشل الإرسال',
        }).eq('id', guest.id);

        // دعوة تجريبية فشلت: تعود إلى رصيد صاحبها
        if (guest.is_trial) await refundTrial(admin, guest);
      }
    }
    return true;
  }

  const current = STATUS_RANK[log.status] ?? 0;
  const next = STATUS_RANK[st.status] ?? 0;
  if (next > current) {
    await admin.from('message_logs').update({ status: st.status }).eq('id', log.id);
  }
  return true;
}

async function refundTrial(admin: SupabaseClient, guest: Guest) {
  let profileId: string | null = null;
  if (guest.inviter_id) {
    const { data } = await admin.from('inviters').select('profile_id').eq('id', guest.inviter_id).maybeSingle();
    profileId = data?.profile_id ?? null;
  }
  if (!profileId) {
    const { data } = await admin.from('events').select('owner_id').eq('id', guest.event_id).maybeSingle();
    profileId = data?.owner_id ?? null;
  }
  if (!profileId) return;
  const { data: prof } = await admin.from('profiles').select('trial_invites_left').eq('id', profileId).maybeSingle();
  await admin.from('profiles')
    .update({ trial_invites_left: (prof?.trial_invites_left ?? 0) + 1 })
    .eq('id', profileId);
}
