import type { SupabaseClient } from '@supabase/supabase-js';
import type { Package, PackageCatalog, PackageTier } from '@/lib/types';
import { sortTiers } from '@/lib/packages';

/**
 * يقرأ كتالوج الباقات من القاعدة — المصدر الوحيد للباقات في كل الشاشات:
 * الصفحة الرئيسية (anon)، وخطوة الباقة، و/e/[id]/info، ولوحة الأدمن.
 *
 * `includeInactive` للأدمن وحده؛ RLS تحجب الموقوفة عن غيره أصلاً.
 */
export async function loadPackageCatalog(
  supabase: SupabaseClient,
  { includeInactive = false }: { includeInactive?: boolean } = {},
): Promise<PackageCatalog> {
  let query = supabase.from('packages').select('*');
  if (!includeInactive) query = query.eq('active', true);

  const { data: pkgData } = await query
    .order('sort_order', { ascending: true })
    .order('seats', { ascending: true })
    .returns<Package[]>();

  const packages = pkgData ?? [];
  const custom = packages.find((p) => p.kind === 'custom') ?? null;

  let tiers: PackageTier[] = [];
  if (custom) {
    const { data } = await supabase
      .from('package_tiers').select('*').eq('package_id', custom.id)
      .order('min_qty', { ascending: true }).returns<PackageTier[]>();
    tiers = sortTiers((data ?? []).map((t) => ({ ...t, unit_price: Number(t.unit_price) })));
  }

  return {
    fixed: packages.filter((p) => p.kind !== 'custom').map((p) => ({ ...p, price: Number(p.price) })),
    custom: custom ? { ...custom, price: Number(custom.price), tiers } : null,
  };
}
