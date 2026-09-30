import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { loadPackageCatalog } from '@/lib/packagesData';
import { PageHeader, EmptyState } from '@/components/ui';
import { togglePackage } from '../actions';
import { PackageForm } from './PackageForm';
import { formatCurrency, formatNumber } from '@/lib/format';
import { lowestUnitPrice } from '@/lib/packages';

export const dynamic = 'force-dynamic';

export default async function PackagesPage({
  searchParams,
}: { searchParams: Promise<{ edit?: string }> }) {
  await requireAdmin();
  const { edit } = await searchParams;
  const supabase = await createClient();
  const catalog = await loadPackageCatalog(supabase, { includeInactive: true });

  const rows = [...catalog.fixed, ...(catalog.custom ? [catalog.custom] : [])];
  const editing = edit ? rows.find((p) => p.id === edit) ?? null : null;

  return (
    <>
      <PageHeader
        title="الباقات"
        subtitle="المصدر الوحيد للباقات: تنعكس فوراً على الصفحة الرئيسية وخطوة الباقة. السعر يتجمّد لحظة الشراء."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="card">
          <div className="px-4 sm:px-5 py-3.5 border-b border-line">
            <h2 className="sec-title">الباقات الحالية</h2>
          </div>
          {rows.length === 0 ? (
            <div className="p-5"><EmptyState title="لا توجد باقات" description="أضف أول باقة من النموذج المجاور." /></div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>الباقة</th><th>النوع</th><th>المقاعد</th><th>السعر</th><th>الترتيب</th><th>الحالة</th><th></th></tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className={editing?.id === p.id ? 'bg-brand-soft/40' : ''}>
                      <td className="font-semibold">
                        {p.name}
                        {p.is_featured ? <span className="badge bg-gold-soft/50 text-gold ms-2">مميّزة</span> : null}
                      </td>
                      <td className="text-[12.5px] text-muted">{p.kind === 'custom' ? 'مخصّصة' : 'ثابتة'}</td>
                      <td className="num">
                        {p.kind === 'custom'
                          ? `من ${formatNumber(p.min_qty ?? 0)}`
                          : formatNumber(p.seats)}
                      </td>
                      <td className="num">
                        {p.kind === 'custom'
                          ? (() => {
                              const low = lowestUnitPrice(catalog.custom?.tiers ?? []);
                              return low != null ? `من ${formatCurrency(low)} / دعوة` : '— بلا شرائح';
                            })()
                          : formatCurrency(p.price)}
                      </td>
                      <td className="num text-muted">{formatNumber(p.sort_order)}</td>
                      <td>
                        <span className={`badge ${p.active ? 'bg-ok-soft text-ok' : 'bg-panel text-muted border border-line'}`}>
                          {p.active ? 'متاحة' : 'موقوفة'}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <Link href={`/admin/packages?edit=${p.id}`} className="btn-ghost btn-sm">تعديل</Link>
                          <form action={togglePackage}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="active" value={String(p.active)} />
                            <button type="submit" className="btn-ghost btn-sm">
                              {p.active ? 'إيقاف' : 'تفعيل'}
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card card-pad h-fit">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="sec-title">{editing ? `تعديل «${editing.name}»` : 'إضافة باقة'}</h2>
            {editing ? <Link href="/admin/packages" className="text-[12.5px] text-brand">باقة جديدة</Link> : null}
          </div>
          <PackageForm editing={editing} />
        </div>
      </div>
    </>
  );
}
