import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient, adminClientAvailable } from '@/lib/supabase/admin';
import { getWebhookVerifyToken, parseWebhookPayload, parseButtonPayload } from '@/lib/whatsapp';
import { askForSeatCount, sendQrToGuest } from '@/lib/invitations';
import { normalizePhone } from '@/lib/format';
import type { Guest } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
 * استقبال ردود المدعوين:
 *   زر "تأكيد"  → دعوة بمقعد واحد تُؤكَّد فوراً، وأكثر من ذلك نسأل عن العدد الفعلي.
 *   قائمة العدد → تأكيد بالعدد المختار ثم إرسال الباركود.
 *   زر "اعتذار" → تحديث الحالة وتحرير المقاعد المحجوزة.
 *
 * نرد دائماً بـ 200 حتى لا تعيد Meta الإرسال بلا نهاية عند خطأ داخلي.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true, ignored: 'invalid_json' });
  }

  if (!adminClientAvailable) {
    console.error('[whatsapp:webhook] SUPABASE_SERVICE_ROLE_KEY غير مضبوط — تعذّرت معالجة الرد');
    return NextResponse.json({ ok: true, ignored: 'service_role_missing' });
  }

  const replies = parseWebhookPayload(body);
  if (replies.length === 0) return NextResponse.json({ ok: true, handled: 0 });

  const admin = createAdminClient();
  let handled = 0;

  for (const reply of replies) {
    try {
      // 1) إيجاد المدعو: من توكن الزر أولاً، وإلا من رقم الجوال
      let guest: Guest | null = null;

      if (reply.buttonPayload) {
        const parsed = parseButtonPayload(reply.buttonPayload);
        if (parsed) {
          const { data } = await admin
            .from('guests').select('*').eq('invite_token', parsed.token).maybeSingle<Guest>();
          guest = data ?? null;
        }
      }

      if (!guest) {
        const phone = normalizePhone(reply.from);
        const { data } = await admin
          .from('guests').select('*')
          .eq('phone', phone)
          .in('status', ['sent', 'accepted'])
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle<Guest>();
        guest = data ?? null;
      }

      if (!guest) continue;

      await admin.from('message_logs').insert({
        event_id: guest.event_id, guest_id: guest.id, kind: 'reply',
        provider: 'meta', to_phone: guest.phone, status: 'sent',
        message_id: reply.messageId,
        payload: { kind: reply.kind, text: reply.text ?? null, button: reply.buttonPayload ?? null },
      });

      if (reply.kind === 'accept') {
        if (guest.max_seats === 1) {
          // مقعد واحد لا يحتاج سؤالاً
          const { data: result } = await admin.rpc('rsvp_accept', {
            p_token: guest.invite_token, p_seats: 1,
          });
          if ((result as { ok: boolean } | null)?.ok) {
            await sendQrToGuest(guest.id);
            handled++;
          }
        } else {
          // نسأل عن العدد الفعلي قبل التأكيد — لا نحجز أكثر من الحاجة
          await askForSeatCount(guest.id);
          handled++;
        }
      } else if (reply.kind === 'seats' && reply.seats) {
        const { data: result } = await admin.rpc('rsvp_accept', {
          p_token: guest.invite_token, p_seats: reply.seats,
        });
        const res = result as { ok: boolean; reason?: string } | null;
        if (res?.ok) {
          await sendQrToGuest(guest.id);
          handled++;
        }
      } else if (reply.kind === 'decline') {
        const { data: result } = await admin.rpc('rsvp_decline', { p_token: guest.invite_token });
        const res = result as { ok: boolean } | null;
        if (res?.ok) handled++;
      }
      // رسالة نصية غير مفهومة: نكتفي بتسجيلها في السجل
    } catch (err) {
      console.error('[whatsapp:webhook] فشل معالجة رد:', err);
    }
  }

  return NextResponse.json({ ok: true, handled });
}
