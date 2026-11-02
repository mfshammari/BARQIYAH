import { requireEventAccess } from '@/lib/auth';
import { PageHeader, Alert } from '@/components/ui';
import { OwnerInviteEditor } from './OwnerInviteEditor';
import { formatEventLine } from '@/lib/format';
import { defaultOccasionText } from '@/lib/inviteVars';
import { publicImageUrl, resolveHeaderImage } from '@/lib/inviteImage';
import { OCCASION_LABELS, type EventRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** «دعوتي» للمالك — تحلّ محلّ اختيار القالب: نصّه وصورته ومعاينته. */
export default async function OwnerInvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event, user } = await requireEventAccess(id);
  const e = event as EventRow;
  const vars = (e.invite_vars ?? {}) as { host?: string; occasion?: string };

  const eventLine = formatEventLine({
    dateGregorian: e.event_date,
    dateHijri: e.event_date_hijri,
    weekday: e.event_weekday,
    time: e.event_time,
    venue: e.venue,
  });

  const missing = !(vars.host && vars.occasion);

  const generatedUrl = resolveHeaderImage({
    kind: 'event', id, imageMode: 'generated', imageUrl: null,
    version: [vars.host, vars.occasion, e.event_date, e.event_time, e.venue, e.host_name],
  })!;

  return (
    <>
      <PageHeader
        title="دعوتي"
        subtitle="نصّ دعوتك وصورتها كما تصل مدعوّيك. الدعاة يكتبون نصوصهم بأنفسهم بالقالب نفسه."
      />

      {missing ? (
        <div className="mb-5">
          <Alert tone="warn" title="لم تكتب نصّ دعوتك بعد">
            لا يمكن إرسال أي دعوة قبل كتابة الجهة الداعية ووصف المناسبة.
          </Alert>
        </div>
      ) : null}

      <OwnerInviteEditor
        eventId={id}
        uid={user.id}
        eventLine={eventLine}
        initial={{
          host: vars.host ?? e.host_name ?? '',
          occasion: vars.occasion ?? defaultOccasionText(
            OCCASION_LABELS[e.occasion_type], [e.celebrant_primary, e.celebrant_secondary],
          ),
          imageMode: e.image_mode ?? 'generated',
          imagePath: e.image_url,
          imagePublicUrl: e.image_url ? publicImageUrl(e.image_url) : null,
          generatedUrl,
        }}
      />
    </>
  );
}
