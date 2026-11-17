'use client';

import Link from 'next/link';
import { useState } from 'react';
import { GuestsTable } from './GuestsTable';
import { ManualMessageEditor } from '@/components/manual-whatsapp/ManualMessageEditor';
import { resolveSignature, templateText, type ManualMessageConfig } from '@/lib/manualMessage';
import type { Guest, Inviter } from '@/lib/types';
import { AttachmentBox, type AttachmentInitial } from '@/components/manual-whatsapp/AttachmentBox';
import { saveEventAttachment, saveManualMessage } from '../actions';

export interface OwnerManualSetup {
  /** وصف المناسبة كما كتبه المالك — {المناسبة} */
  occasion: string;
  /** اليوم والتاريخ الهجري والوقت — {التاريخ} */
  date: string;
  /** {المكان} */
  venue: string;
  /** اسم حساب صاحب المناسبة — التوقيع بلا خيار */
  ownerName: string;
  config: ManualMessageConfig;
  /** حساب الرافع ومرفق الدعوة الحالي */
  uid: string;
  attachment: AttachmentInitial;
}

/**
 * جدول مدعوّي المالك مع محرّر رسالة واتساب فوقه: التعديل غير المحفوظ يُستخدم
 * فوراً في أزرار «واتساب» (الحالة مشتركة هنا)، والحفظ يكتب events.manual_message.
 */
export function OwnerGuestsSection({
  eventId, guests, inviters, appUrl, canSend, platformSend, manual,
}: {
  eventId: string;
  guests: Guest[];
  inviters: Inviter[];
  appUrl: string;
  canSend: boolean;
  /** الإرسال من المنصة متاح (واتساب مربوط) — وإلا زر «واتساب» اليدوي فقط */
  platformSend: boolean;
  /** null = المالك لم يكتب نصّ دعوته بعد */
  manual: OwnerManualSetup | null;
}) {
  const [config, setConfig] = useState<ManualMessageConfig>(manual?.config ?? { template: 'formal', texts: {} });
  const sampleGuest = guests[0];

  return (
    <div className="space-y-4">
      {manual ? (
        <ManualMessageEditor
          config={config}
          onConfigChange={setConfig}
          names={{ ownerName: manual.ownerName }}
          sample={{
            guestName: sampleGuest?.name ?? 'خالد الفهد',
            occasion: manual.occasion,
            date: manual.date,
            venue: manual.venue,
            link: `${appUrl}/rsvp/${sampleGuest?.invite_token ?? '…'}`,
          }}
          save={(c) => saveManualMessage(eventId, c)}
          attachment={
            <AttachmentBox
              uid={manual.uid} folder={eventId} initial={manual.attachment}
              save={(mode, path) => saveEventAttachment(eventId, mode, path)}
            />
          }
        />
      ) : (
        <div className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn">
          اكتب نصّ دعوتك من{' '}
          <Link href={`/e/${eventId}/invite`} className="font-semibold underline">صفحة «دعوتي»</Link>
          {' '}ليظهر زر «واتساب» بجانب كل مدعو.
        </div>
      )}

      <GuestsTable
        eventId={eventId}
        guests={guests}
        inviters={inviters}
        appUrl={appUrl}
        canSend={canSend}
        platformSend={platformSend}
        manual={manual ? {
          occasion: manual.occasion,
          date: manual.date,
          venue: manual.venue,
          signature: resolveSignature({ ownerName: manual.ownerName }, 'owner'),
          text: templateText(config),
        } : null}
      />
    </div>
  );
}
