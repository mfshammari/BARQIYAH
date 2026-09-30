/**
 * منطق الباقات الخالص — مرآة دالة custom_package_price في القاعدة
 * للمعاينة الحيّة في الواجهة، والتحقق من الشرائح قبل الحفظ.
 *
 * التسعير التراكمي: الشريحة الأولى تسعّر من ١ إلى ما قبل الثانية،
 * والثانية من حدّها إلى ما قبل الثالثة، وهكذا — فلا تنخفض الفاتورة
 * بزيادة الكمية أبداً.
 */

export interface TierLike {
  min_qty: number;
  unit_price: number;
}

/** الشرائح مرتّبة تصاعدياً بالكمية. */
export function sortTiers<T extends TierLike>(tiers: T[]): T[] {
  return [...tiers].sort((a, b) => a.min_qty - b.min_qty);
}

/** سعر كمية مخصّصة بالتدرّج التراكمي. يطابق custom_package_price حرفياً. */
export function customPrice(tiers: TierLike[], qty: number): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  const sorted = sortTiers(tiers);
  let total = 0;
  for (let i = 0; i < sorted.length; i++) {
    const lower = i === 0 ? 1 : sorted[i].min_qty;
    const next = sorted[i + 1]?.min_qty;
    const upper = next ? Math.min(qty, next - 1) : qty;
    const units = Math.max(0, upper - lower + 1);
    total += units * Number(sorted[i].unit_price);
  }
  return Math.round(total * 100) / 100;
}

/** سعر الإضافة على رصيد قائم: الفرق بين الإجمالي التراكمي والرصيد الحالي. */
export function customUpgradePrice(tiers: TierLike[], currentSeats: number, qty: number): number {
  const base = Math.max(0, currentSeats);
  return Math.round((customPrice(tiers, base + qty) - customPrice(tiers, base)) * 100) / 100;
}

/** أدنى سعر للدعوة بين الشرائح — لبطاقة «من X ر.س للدعوة». */
export function lowestUnitPrice(tiers: TierLike[]): number | null {
  if (tiers.length === 0) return null;
  return Math.min(...tiers.map((t) => Number(t.unit_price)));
}

/**
 * التحقق من الشرائح كما تتحقق القاعدة (TIERS_INVALID):
 * كميات فريدة، تصاعدية، أسعار تنازلية، وأول شريحة = min_qty.
 * يرجع رسالة عربية أو null إن كانت صالحة.
 */
export function validateTiers(tiers: TierLike[], minQty: number): string | null {
  if (!Number.isInteger(minQty) || minQty <= 0) return 'أقل كمية يجب أن تكون رقماً صحيحاً موجباً.';
  if (tiers.length === 0) return 'أضف شريحة واحدة على الأقل.';

  for (const t of tiers) {
    if (!Number.isInteger(t.min_qty) || t.min_qty <= 0) return 'كمية الشريحة يجب أن تكون رقماً صحيحاً موجباً.';
    if (!Number.isFinite(t.unit_price) || t.unit_price <= 0) return 'سعر الدعوة يجب أن يكون أكبر من صفر.';
  }

  const sorted = sortTiers(tiers);
  if (sorted[0].min_qty !== minQty) return 'أول شريحة يجب أن تبدأ من أقل كمية للباقة.';

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].min_qty === sorted[i - 1].min_qty) return 'لا يجوز تكرار كمية الشريحة.';
    if (sorted[i].unit_price >= sorted[i - 1].unit_price) {
      return 'سعر الدعوة يجب أن ينخفض مع زيادة الكمية.';
    }
  }
  return null;
}

/** المزايا: سطر لكل ميزة، تُهمل الفراغات. */
export function parseFeatures(text: string): string[] {
  return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}
