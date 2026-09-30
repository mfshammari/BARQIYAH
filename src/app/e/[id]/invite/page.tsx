import { requireEventAccess } from '@/lib/auth';
import { PageHeader, Alert } from '@/components/ui';
import { OwnerInviteEditor } from './OwnerInviteEditor';
import { formatEventLine } from '@/lib/format';
import { defaultOccasionText } from '@/lib/inviteVars';
import { OCCASION_LABELS, type EventRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** «دعوتي» للمالك — تحلّ محلّ اختيار القالب: نصّه وصورته ومعاينته. */
export default async function OwnerInvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event } = await requireEventAccess(id);
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
        eventLine={eventLine}
        initial={{
          host: vars.host ?? e.host_name ?? '',
          occasion: vars.occasion ?? defaultOccasionText(
            OCCASION_LABELS[e.occasion_type], [e.celebrant_primary, e.celebrant_secondary],
          ),
          imageUrl: e.image_url,
        }}
      />
    </>
  );
}
