'use client';

import { useState, type ReactNode } from 'react';
import { validateInviteVars, renderInvite, MAX_VAR_LENGTH } from '@/lib/inviteVars';

/**
 * حقلا القالب الموحّد {{1}} و{{2}} مع صفّ مقفل للموعد والمكان ومعاينة حيّة
 * — واحد للمالك (إنشاء المناسبة و/e/[id]/invite) وللداعي (InviteEditor).
 *
 * يُعيد إلى الأب صلاحية القيم عبر onChange ليقرّر تفعيل الحفظ/التالي.
 * لا يحوي <form>: يوضع داخل نموذج الأب بحقلَي host وoccasion.
 */
export function InviteTextEditor({
  host, occasion, eventLine, onHostChange, onOccasionChange,
  hostLabel = 'من الداعي؟', occasionLabel = 'ما المناسبة؟',
  hostHint = 'كما تريد أن يظهر في الدعوة.', occasionHint = 'وصف المناسبة كما تكتبه أنت.',
  fieldPrefix = '', image,
}: {
  host: string;
  occasion: string;
  eventLine: string;
  onHostChange: (v: string) => void;
  onOccasionChange: (v: string) => void;
  hostLabel?: string;
  occasionLabel?: string;
  hostHint?: string;
  occasionHint?: string;
  /** لتفادي تعارض المعرّفات عند وجود أكثر من محرّر في الصفحة */
  fieldPrefix?: string;
  /** صورة الدعوة (اختيارية) تُعرض أعلى المعاينة */
  image?: ReactNode;
}) {
  const [touched, setTouched] = useState(false);
  const issues = validateInviteVars({ host, occasion });
  const issueFor = (f: 'host' | 'occasion') => issues.find((i) => i.field === f);
  const show = touched || host.length > 0 || occasion.length > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px] items-start">
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor={`${fieldPrefix}host`}>{hostLabel}</label>
          <input
            id={`${fieldPrefix}host`} name="host" className="field" value={host}
            maxLength={MAX_VAR_LENGTH + 20}
            onChange={(e) => { setTouched(true); onHostChange(e.target.value); }}
            placeholder="أم عبدالله الفالح"
          />
          <div className="flex justify-between gap-3">
            <p className={`hint ${show && issueFor('host') ? 'text-danger' : ''}`}>
              {show && issueFor('host') ? issueFor('host')!.message : hostHint}
            </p>
            <span className={`hint num shrink-0 ${host.length > MAX_VAR_LENGTH ? 'text-danger' : ''}`}>
              {host.length}/{MAX_VAR_LENGTH}
            </span>
          </div>
        </div>

        <div>
          <label className="label" htmlFor={`${fieldPrefix}occasion`}>{occasionLabel}</label>
          <input
            id={`${fieldPrefix}occasion`} name="occasion" className="field" value={occasion}
            maxLength={MAX_VAR_LENGTH + 20}
            onChange={(e) => { setTouched(true); onOccasionChange(e.target.value); }}
            placeholder="زواج ابني محمد"
          />
          <div className="flex justify-between gap-3">
            <p className={`hint ${show && issueFor('occasion') ? 'text-danger' : ''}`}>
              {show && issueFor('occasion') ? issueFor('occasion')!.message : occasionHint}
            </p>
            <span className={`hint num shrink-0 ${occasion.length > MAX_VAR_LENGTH ? 'text-danger' : ''}`}>
              {occasion.length}/{MAX_VAR_LENGTH}
            </span>
          </div>
        </div>

        {/* صف مقفل — مصدره بيانات المناسبة */}
        <div>
          <span className="label">الموعد والمكان</span>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3.5 py-2.5">
            <span className="text-muted" aria-hidden>🔒</span>
            <span className="text-[13px] text-muted num">{eventLine || '—'}</span>
          </div>
          <p className="hint">يُحقن آلياً من بيانات المناسبة — الموعد واحد للجميع.</p>
        </div>

        {issues.length > 0 && show ? (
          <p className="hint text-danger">صحّح الملاحظات أعلاه — واتساب يرفض القالب وقد يضرّ ذلك بالرقم المشترك.</p>
        ) : null}
      </div>

      {/* المعاينة الحيّة كما تصل على واتساب */}
      <aside className="lg:sticky lg:top-24">
        <div className="mb-2 text-[12.5px] font-semibold text-muted">كما تصل على واتساب</div>
        <div className="overflow-hidden rounded-2xl border border-line bg-[#E6DDD4] p-3">
          <div className="rounded-xl bg-white p-3 shadow-sm">
            {image}
            <p className="text-[13px] leading-7 text-ink">{renderInvite({ host, occasion }, eventLine)}</p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <span className="rounded-lg bg-white py-2 text-center text-[12.5px] font-semibold text-[#075E54]">تأكيد الحضور</span>
            <span className="rounded-lg bg-white py-2 text-center text-[12.5px] font-semibold text-[#075E54]">الاعتذار</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
