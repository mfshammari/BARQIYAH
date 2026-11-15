'use client';

import { useState } from 'react';
import { formatDate, formatNumber } from '@/lib/format';
import { REASONS, exemptionStatus, remainingOf } from '@/lib/exemptions/logic';
import {
  REASON_LABELS, REVOKE_CONFIRM_TEXT, type Exemption, type ExemptionReason, type GrantInput,
} from '@/lib/exemptions/types';

const STATUS_LABEL = {
  active: { text: 'نشط', cls: 'bg-ok-soft text-ok' },
  cap_reached: { text: 'بلغ السقف', cls: 'bg-warn-soft text-warn' },
  revoked: { text: 'مسحوب', cls: 'bg-danger-soft text-danger' },
  expired: { text: 'منتهٍ', cls: 'bg-panel text-muted border border-line' },
} as const;

/**
 * حوار «إعفاء الحساب من الدفع»: نموذج المنح للحساب العادي، ولوحة إدارة
 * (السقف، المانح، تعديل السقف، سحب) للحساب المعفى.
 */
export function ExemptionDialog({
  accountName, exemption, adminName, busy, error,
  onGrant, onUpdateCap, onRevoke, onClose,
}: {
  accountName: string;
  exemption: Exemption | null;
  adminName: (id: string) => string;
  busy: boolean;
  error: string | null;
  onGrant: (input: GrantInput) => void;
  onUpdateCap: (cap: number) => void;
  onRevoke: () => void;
  onClose: () => void;
}) {
  const manageable = exemption && !exemption.revokedAt;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exemption-title"
        className="card w-full max-w-md card-pad text-ink max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="exemption-title" className="font-ui text-base font-bold">إعفاء الحساب من الدفع</h3>
        <p className="mt-0.5 text-[12.5px] text-muted">{accountName}</p>

        {error ? (
          <div className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{error}</div>
        ) : null}

        {manageable
          ? <ManagePanel exemption={exemption} adminName={adminName} busy={busy}
              onUpdateCap={onUpdateCap} onRevoke={onRevoke} onClose={onClose} />
          : <GrantForm busy={busy} previous={exemption} onGrant={onGrant} onClose={onClose} />}
      </div>
    </div>
  );
}

function GrantForm({
  busy, previous, onGrant, onClose,
}: {
  busy: boolean;
  previous: Exemption | null;
  onGrant: (input: GrantInput) => void;
  onClose: () => void;
}) {
  const [cap, setCap] = useState('');
  const [reason, setReason] = useState<ExemptionReason | ''>('');
  const [note, setNote] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [touched, setTouched] = useState(false);

  const capNum = Number(cap);
  const capOk = cap !== '' && Number.isInteger(capNum) && capNum >= 1;
  const valid = capOk && reason !== '';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onGrant({
      cap: capNum,
      reason: reason as ExemptionReason,
      note: note.trim() || undefined,
      expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : undefined,
    });
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
      {previous ? (
        <p className="rounded-xl bg-panel px-3.5 py-2.5 text-[12.5px] text-muted">
          الإعفاء السابق {previous.revokedAt ? 'مُسحب' : 'منتهٍ'} — استُخدم منه{' '}
          <span className="num">{formatNumber(previous.used)}</span> من{' '}
          <span className="num">{formatNumber(previous.cap)}</span>. المنح الجديد يبدأ من الصفر.
        </p>
      ) : null}

      <div>
        <label className="label" htmlFor="ex-cap">عدد الدعوات المجانية</label>
        <input
          id="ex-cap" type="number" min={1} step={1} inputMode="numeric" required
          value={cap} onChange={(e) => setCap(e.target.value)}
          className={`field num ${touched && !capOk ? '!border-danger' : ''}`}
        />
        <p className="hint">يُخصم منها كل ما يرسله الحساب في جميع مناسباته.</p>
        {touched && !capOk ? <p className="hint !text-danger">أدخل رقمًا صحيحًا لا يقل عن ١</p> : null}
      </div>

      <div>
        <label className="label" htmlFor="ex-reason">السبب</label>
        <select
          id="ex-reason" required value={reason}
          onChange={(e) => setReason(e.target.value as ExemptionReason | '')}
          className={`field ${touched && reason === '' ? '!border-danger' : ''}`}
        >
          <option value="">— اختر —</option>
          {REASONS.map((r) => <option key={r} value={r}>{REASON_LABELS[r]}</option>)}
        </select>
        {touched && reason === '' ? <p className="hint !text-danger">اختر السبب</p> : null}
      </div>

      <div>
        <label className="label" htmlFor="ex-note">ملاحظة</label>
        <input id="ex-note" value={note} onChange={(e) => setNote(e.target.value)} className="field" />
      </div>

      <div>
        <label className="label" htmlFor="ex-expires">تاريخ الانتهاء</label>
        <input
          id="ex-expires" type="date" value={expiresAt} dir="ltr"
          min={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setExpiresAt(e.target.value)} className="field text-left"
        />
        <p className="hint">اتركه فارغًا ليبقى الإعفاء إلى أن تسحبه.</p>
      </div>

      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={busy} className="btn-primary flex-1">تفعيل الإعفاء</button>
        <button type="button" onClick={onClose} className="btn-ghost flex-1">إلغاء</button>
      </div>
    </form>
  );
}

function ManagePanel({
  exemption, adminName, busy, onUpdateCap, onRevoke, onClose,
}: {
  exemption: Exemption;
  adminName: (id: string) => string;
  busy: boolean;
  onUpdateCap: (cap: number) => void;
  onRevoke: () => void;
  onClose: () => void;
}) {
  const [editingCap, setEditingCap] = useState(false);
  const [cap, setCap] = useState(String(exemption.cap));
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const status = exemptionStatus(exemption);
  const capNum = Number(cap);
  const capValid = Number.isInteger(capNum) && capNum >= Math.max(1, exemption.used);

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl bg-brand-soft px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-brand/80">{REASON_LABELS[exemption.reason]}{exemption.note ? ` · ${exemption.note}` : ''}</span>
          <span className={`badge ${STATUS_LABEL[status].cls}`}>{STATUS_LABEL[status].text}</span>
        </div>
        <div className="mt-2 text-[15px] font-bold text-brand">
          المستخدم: <span className="num">{formatNumber(exemption.used)}</span> من <span className="num">{formatNumber(exemption.cap)}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/70">
          <div className="h-full bg-brand" style={{ width: `${Math.min(100, (exemption.used / exemption.cap) * 100)}%` }} />
        </div>
        <div className="mt-2 text-[12px] text-brand/80">
          المتبقي <span className="num">{formatNumber(remainingOf(exemption))}</span>
          {exemption.expiresAt ? <> · ينتهي في <span className="num">{formatDate(exemption.expiresAt)}</span></> : ' · بلا تاريخ انتهاء'}
        </div>
      </div>

      <p className="text-[12.5px] text-muted">
        مُنح بواسطة <b className="text-ink">{adminName(exemption.grantedBy)}</b> في{' '}
        <span className="num">{formatDate(exemption.grantedAt)}</span>
      </p>

      {editingCap ? (
        <div className="rounded-xl border border-line bg-paper p-3.5">
          <label className="label" htmlFor="ex-newcap">السقف الجديد</label>
          <input
            id="ex-newcap" type="number" step={1} min={Math.max(1, exemption.used)} inputMode="numeric"
            value={cap} onChange={(e) => setCap(e.target.value)} className="field num"
          />
          <p className="hint">لا يمكن أن يقلّ عن المستخدم (<span className="num">{formatNumber(exemption.used)}</span>).</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy || !capValid} onClick={() => onUpdateCap(capNum)} className="btn-primary btn-sm flex-1">حفظ السقف</button>
            <button type="button" onClick={() => { setEditingCap(false); setCap(String(exemption.cap)); }} className="btn-ghost btn-sm flex-1">إلغاء</button>
          </div>
        </div>
      ) : null}

      {confirmRevoke ? (
        <div className="rounded-xl border border-danger/25 bg-danger-soft p-3.5">
          <p className="text-[13px] leading-7 text-danger">{REVOKE_CONFIRM_TEXT}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={onRevoke} className="btn-danger btn-sm flex-1">تأكيد السحب</button>
            <button type="button" onClick={() => setConfirmRevoke(false)} className="btn-ghost btn-sm flex-1">تراجع</button>
          </div>
        </div>
      ) : null}

      {!editingCap && !confirmRevoke ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditingCap(true)} className="btn-soft">تعديل السقف</button>
          <button type="button" onClick={() => setConfirmRevoke(true)} className="btn-danger">سحب الإعفاء</button>
          <button type="button" onClick={onClose} className="btn-ghost ms-auto">إغلاق</button>
        </div>
      ) : null}
    </div>
  );
}
