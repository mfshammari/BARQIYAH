'use client';

import { useActionState, useMemo, useState } from 'react';
import { SubmitButton } from '@/components/ActionForm';
import { savePackage, type ActionState } from '../actions';
import { customPrice, validateTiers, type TierLike } from '@/lib/packages';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { Package, PackageKind, PackageTier } from '@/lib/types';

type Editing = (Package & { tiers?: PackageTier[] }) | null;

/**
 * نموذج الباقة — إضافة أو تعديل (id مخفي). للمخصّصة محرّر شرائح مع
 * تحقق في الواجهة (والقاعدة تتحقق ثانيةً) ومعاينة حيّة «١٥٠٠ دعوة = X ر.س».
 */
export function PackageForm({ editing }: { editing: Editing }) {
  const [state, action] = useActionState<ActionState, FormData>(savePackage, {});
  const [kind, setKind] = useState<PackageKind>(editing?.kind ?? 'fixed');
  const [minQty, setMinQty] = useState<number>(editing?.min_qty ?? 1000);
  const [tiers, setTiers] = useState<TierLike[]>(
    editing?.tiers?.length
      ? editing.tiers.map((t) => ({ min_qty: t.min_qty, unit_price: Number(t.unit_price) }))
      : [{ min_qty: editing?.min_qty ?? 1000, unit_price: 1.5 }],
  );
  const [sampleQty, setSampleQty] = useState(1500);

  const tierError = kind === 'custom' ? validateTiers(tiers, minQty) : null;
  const sample = useMemo(() => customPrice(tiers, sampleQty), [tiers, sampleQty]);

  const setTier = (i: number, patch: Partial<TierLike>) =>
    setTiers((prev) => prev.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <form action={action} className="space-y-4" key={editing?.id ?? 'new'}>
      {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
      <input type="hidden" name="tiers" value={JSON.stringify(kind === 'custom' ? tiers : [])} />

      {state.error ? (
        <div className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">{state.error}</div>
      ) : null}
      {state.notice ? (
        <div className="rounded-xl bg-ok-soft px-3.5 py-2.5 text-[13px] text-ok">{state.notice}</div>
      ) : null}

      <div>
        <label className="label" htmlFor="pkg-name">اسم الباقة</label>
        <input id="pkg-name" name="name" className="field" placeholder="قياسية" required
          defaultValue={editing?.name ?? ''} />
      </div>

      <div>
        <label className="label" htmlFor="pkg-kind">النوع</label>
        <select id="pkg-kind" name="kind" className="field" value={kind}
          onChange={(e) => setKind(e.target.value as PackageKind)}>
          <option value="fixed">ثابتة — مقاعد وسعر</option>
          <option value="custom">مخصّصة — تسعير متدرّج بالكمية</option>
        </select>
      </div>

      {kind === 'fixed' ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="pkg-seats">المقاعد</label>
            <input id="pkg-seats" name="seats" type="number" min={1} className="field num"
              placeholder="300" required defaultValue={editing?.seats ?? ''} />
          </div>
          <div>
            <label className="label" htmlFor="pkg-price">السعر (ر.س)</label>
            <input id="pkg-price" name="price" type="number" min={0} step="0.01" className="field num"
              placeholder="699" required defaultValue={editing?.price ?? ''} />
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-line bg-panel p-3.5">
          <div>
            <label className="label" htmlFor="pkg-min">أقل كمية (دعوة)</label>
            <input id="pkg-min" name="min_qty" type="number" min={1} className="field num"
              value={minQty} onChange={(e) => setMinQty(Math.max(1, Math.floor(Number(e.target.value) || 0)))} />
          </div>

          <div>
            <div className="label">الشرائح — من كمية / سعر الدعوة</div>
            <div className="space-y-2">
              {tiers.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="number" min={1} className="field num" placeholder="من كمية"
                    value={t.min_qty || ''} aria-label="من كمية"
                    onChange={(e) => setTier(i, { min_qty: Math.floor(Number(e.target.value) || 0) })} />
                  <input type="number" min={0.01} step="0.01" className="field num" placeholder="سعر الدعوة"
                    value={t.unit_price || ''} aria-label="سعر الدعوة"
                    onChange={(e) => setTier(i, { unit_price: Number(e.target.value) || 0 })} />
                  <button type="button" className="btn-ghost btn-sm shrink-0" aria-label="حذف الشريحة"
                    onClick={() => setTiers((prev) => prev.filter((_, j) => j !== i))}
                    disabled={tiers.length === 1}>×</button>
                </div>
              ))}
            </div>
            <button type="button" className="btn-ghost btn-sm mt-2"
              onClick={() => setTiers((prev) => {
                const last = prev[prev.length - 1];
                return [...prev, { min_qty: (last?.min_qty ?? 0) * 2 || 1000, unit_price: Math.max(0.01, (last?.unit_price ?? 1) - 0.1) }];
              })}>
              + شريحة
            </button>
            <p className={`hint ${tierError ? 'text-danger' : ''}`}>
              {tierError ?? 'التسعير تراكمي: كل شريحة تسعّر ما يقع داخلها فلا تنخفض الفاتورة بزيادة الكمية.'}
            </p>
          </div>

          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-muted">معاينة:</span>
            <input type="number" min={1} className="field num w-28" value={sampleQty}
              onChange={(e) => setSampleQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
            <span className="num">
              {formatNumber(sampleQty)} دعوة = <b className="text-gold">{tierError ? '—' : formatCurrency(sample)}</b>
            </span>
          </div>
        </div>
      )}

      <div>
        <label className="label" htmlFor="pkg-desc">الوصف</label>
        <input id="pkg-desc" name="description" className="field" placeholder="الخيار الأنسب لأغلب حفلات الزفاف."
          defaultValue={editing?.description ?? ''} />
      </div>

      <div>
        <label className="label" htmlFor="pkg-feat">المزايا (سطر لكل ميزة)</label>
        <textarea id="pkg-feat" name="features" rows={4} className="field leading-7"
          placeholder={'إرسال عبر واتساب\nباركود لكل مدعو'}
          defaultValue={(editing?.features ?? []).join('\n')} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="pkg-sort">الترتيب</label>
          <input id="pkg-sort" name="sort_order" type="number" className="field num"
            defaultValue={editing?.sort_order ?? 0} />
        </div>
        <div className="space-y-2 pt-6">
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" name="is_featured" className="accent-brand"
              defaultChecked={editing?.is_featured ?? false} />
            مميّزة (واحدة فقط)
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" name="active" className="accent-brand"
              defaultChecked={editing?.active ?? true} />
            متاحة للعملاء
          </label>
        </div>
      </div>

      <SubmitButton className={`btn-primary w-full ${tierError ? 'pointer-events-none opacity-50' : ''}`}>
        {editing ? 'حفظ التعديل' : 'حفظ الباقة'}
      </SubmitButton>
    </form>
  );
}
