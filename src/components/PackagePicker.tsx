'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { customPrice, customUpgradePrice, lowestUnitPrice } from '@/lib/packages';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { PackageCatalog } from '@/lib/types';

/**
 * بطاقات الباقات من القاعدة نفسها — تُستخدم في خطوة الباقة عند الإنشاء
 * وفي /e/[id]/info للترقية. للمخصّصة حقل كمية مع سعر حيّ: يُحسب فوراً
 * بمرآة الشرائح ثم يُثبَّت من دالة custom_package_price (RPC).
 *
 * `baseSeats` > 0 يعني إضافة على رصيد قائم فتُسعَّر بالفرق التراكمي.
 */
export function PackagePicker({
  catalog, initialPackageId = '', initialQty, baseSeats = 0, onChange,
}: {
  catalog: PackageCatalog;
  initialPackageId?: string;
  initialQty?: number | null;
  baseSeats?: number;
  onChange?: (v: { packageId: string; qty: number | null }) => void;
}) {
  const { fixed, custom } = catalog;
  const [packageId, setPackageId] = useState(initialPackageId);
  const [qty, setQty] = useState<number>(initialQty ?? custom?.min_qty ?? 0);
  const [rpcPrice, setRpcPrice] = useState<number | null>(null);

  const isCustom = Boolean(custom && packageId === custom.id);
  const minQty = custom?.min_qty ?? 1;
  const upgrade = baseSeats > 0;

  const localPrice = useMemo(() => {
    if (!custom) return 0;
    return upgrade ? customUpgradePrice(custom.tiers, baseSeats, qty) : customPrice(custom.tiers, qty);
  }, [custom, qty, baseSeats, upgrade]);

  // تثبيت السعر من القاعدة (المصدر الوحيد للتسعير)
  useEffect(() => {
    if (!isCustom || !custom || qty <= 0) { setRpcPrice(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const supabase = createClient();
        const total = await supabase.rpc('custom_package_price', { p_qty: baseSeats + qty });
        const base = upgrade ? await supabase.rpc('custom_package_price', { p_qty: baseSeats }) : { data: 0 };
        if (cancelled || total.error) return;
        setRpcPrice(Number(total.data ?? 0) - Number(base.data ?? 0));
      } catch { /* نبقى على الحساب المحلي */ }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [isCustom, custom, qty, baseSeats, upgrade]);

  useEffect(() => {
    onChange?.({ packageId, qty: isCustom ? qty : null });
  }, [packageId, qty, isCustom, onChange]);

  const price = rpcPrice ?? localPrice;
  const qtyTooLow = !upgrade && qty < minQty;
  const lowest = custom ? lowestUnitPrice(custom.tiers) : null;

  if (fixed.length === 0 && !custom) {
    return <p className="text-[13px] text-warn">لا توجد باقات متاحة حالياً — تواصل مع الإدارة.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {fixed.map((p) => (
          <label
            key={p.id}
            className={`relative cursor-pointer rounded-xl border p-4 transition-colors ${
              packageId === p.id ? 'border-brand bg-brand-soft' : 'border-line hover:bg-panel'
            }`}
          >
            <input
              type="radio" name="package_id" value={p.id} className="sr-only"
              checked={packageId === p.id} onChange={() => setPackageId(p.id)}
            />
            {p.is_featured ? (
              <span className="absolute top-3 left-3 badge bg-gold-soft/50 text-gold">الأكثر طلباً</span>
            ) : null}
            <div className="font-ui font-bold">{p.name}</div>
            <div className="mt-1 font-ui text-2xl font-extrabold num">{formatNumber(p.seats)}</div>
            <div className="text-[12px] text-muted">مقعداً</div>
            {p.description ? (
              <p className="mt-1.5 text-[12px] leading-6 text-muted">{p.description}</p>
            ) : null}
            <div className="mt-2 border-t border-line pt-2 text-[13px] font-semibold text-gold num">
              {formatCurrency(p.price)}
            </div>
          </label>
        ))}

        {custom ? (
          <label
            className={`cursor-pointer rounded-xl border p-4 transition-colors sm:col-span-2 ${
              isCustom ? 'border-brand bg-brand-soft' : 'border-line hover:bg-panel'
            }`}
          >
            <input
              type="radio" name="package_id" value={custom.id} className="sr-only"
              checked={isCustom} onChange={() => setPackageId(custom.id)}
            />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-ui font-bold">{custom.name}</div>
                <div className="mt-0.5 text-[12.5px] text-muted num">
                  ابتداءً من {formatNumber(custom.min_qty ?? 0)} دعوة
                  {lowest != null ? ` · من ${formatCurrency(lowest)} للدعوة` : ''}
                </div>
                {custom.description ? (
                  <p className="mt-1.5 text-[12px] leading-6 text-muted">{custom.description}</p>
                ) : null}
              </div>
              <ul className="text-[11.5px] text-muted num space-y-0.5">
                {custom.tiers.map((t) => (
                  <li key={t.id}>من {formatNumber(t.min_qty)} دعوة: {formatCurrency(t.unit_price)} / دعوة</li>
                ))}
              </ul>
            </div>

            <div className={`mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3 ${isCustom ? '' : 'opacity-60'}`}>
              <div>
                <span className="label">{upgrade ? 'عدد الدعوات المضافة' : 'عدد الدعوات'}</span>
                <input
                  type="number" name="package_qty" min={upgrade ? 1 : minQty} step={1}
                  className="field num w-36" value={qty || ''}
                  onFocus={() => setPackageId(custom.id)}
                  onChange={(e) => setQty(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                />
              </div>
              <div className="text-[13px]">
                <span className="text-muted">الإجمالي: </span>
                <b className="text-gold num">{qty > 0 && !qtyTooLow ? formatCurrency(price) : '—'}</b>
              </div>
            </div>
            {isCustom && qtyTooLow ? (
              <p className="hint text-danger num">أقل كمية {formatNumber(minQty)} دعوة.</p>
            ) : null}
          </label>
        ) : null}
      </div>
    </div>
  );
}
