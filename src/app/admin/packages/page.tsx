import { createClient } from '@/lib/supabase/server';
import { PageHeader, EmptyState } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { savePackage, togglePackage } from '../actions';
import { formatCurrency, formatNumber } from '@/lib/format';
import type { Package } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function PackagesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('packages').select('*').order('seats', { ascending: true }).returns<Package[]>();
  const packages = data ?? [];

  return (
    <>
      <PageHeader title="الباقات" subtitle="الباقة تُشترى لكل مناسبة، والرصيد بالمقاعد (عدد الأشخاص)." />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="card">
          <div className="px-4 sm:px-5 py-3.5 border-b border-line">
            <h2 className="sec-title">الباقات الحالية</h2>
          </div>
          {packages.length === 0 ? (
            <div className="p-5"><EmptyState title="لا توجد باقات" description="أضف أول باقة من النموذج المجاور." /></div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>الباقة</th><th>المقاعد</th><th>السعر</th><th>الحالة</th><th></th></tr>
                </thead>
                <tbody>
                  {packages.map((p) => (
                    <tr key={p.id}>
                      <td className="font-semibold">{p.name}</td>
                      <td className="num">{formatNumber(p.seats)}</td>
                      <td className="num">{formatCurrency(p.price)}</td>
                      <td>
                        <span className={`badge ${p.active ? 'bg-ok-soft text-ok' : 'bg-panel text-muted border border-line'}`}>
                          {p.active ? 'مفعّلة' : 'موقوفة'}
                        </span>
                      </td>
                      <td>
                        <form action={togglePackage}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="active" value={String(p.active)} />
                          <button type="submit" className="btn-ghost btn-sm">
                            {p.active ? 'إيقاف' : 'تفعيل'}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card card-pad h-fit">
          <h2 className="sec-title mb-4">إضافة باقة</h2>
          <ActionForm action={savePackage} onSuccessReset>
            <div>
              <label className="label" htmlFor="pkg-name">اسم الباقة</label>
              <input id="pkg-name" name="name" className="field" placeholder="باقة ٣٠٠ مقعد" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="pkg-seats">المقاعد</label>
                <input id="pkg-seats" name="seats" type="number" min={1} className="field num" placeholder="300" required />
              </div>
              <div>
                <label className="label" htmlFor="pkg-price">السعر (ر.س)</label>
                <input id="pkg-price" name="price" type="number" min={0} step="0.01" className="field num" placeholder="1299" required />
              </div>
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" name="active" defaultChecked className="accent-brand" />
              متاحة للعملاء
            </label>
            <SubmitButton className="btn-primary w-full">حفظ الباقة</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
