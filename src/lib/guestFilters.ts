/**
 * تصفية قائمة المدعوين وترتيبها — منطق خالص تتشاركه صفحة صاحب المناسبة
 * وصفحة الداعي.
 */
import type { Guest } from './types';

/** تصفية فتح الدعوة: «لم يفتح» = أُرسلت له ولم يفتح رابطه (المسودة لم تُرسل أصلاً) */
export type OpenedFilter = 'all' | 'opened' | 'unopened';
/** ترتيب «آخر تحديث»: none = ترتيب القائمة الأصلي */
export type UpdatedSort = 'none' | 'desc' | 'asc';

type Stamps = Pick<Guest, 'attended_at' | 'responded_at' | 'opened_at' | 'reminded_at' | 'sent_at' | 'created_at'>;

/** آخر ما جرى على الدعوة: حضور، ردّ، فتح، تذكير، إرسال — وإلا تاريخ الإضافة */
export function lastUpdate(g: Stamps): string {
  const stamps = [g.attended_at, g.responded_at, g.opened_at, g.reminded_at, g.sent_at, g.created_at]
    .filter(Boolean) as string[];
  return stamps.reduce((latest, t) => (Date.parse(t) > Date.parse(latest) ? t : latest), g.created_at);
}

export function isUnopened(g: Pick<Guest, 'status' | 'opened_at'>): boolean {
  return g.status !== 'draft' && !g.opened_at;
}

export function matchesOpened(g: Pick<Guest, 'status' | 'opened_at'>, filter: OpenedFilter): boolean {
  if (filter === 'opened') return Boolean(g.opened_at);
  if (filter === 'unopened') return isUnopened(g);
  return true;
}

/** نسخة مرتّبة بآخر تحديث؛ none تعيد القائمة كما هي */
export function sortByUpdate<T extends Stamps>(rows: T[], sort: UpdatedSort): T[] {
  if (sort === 'none') return rows;
  const dir = sort === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = Date.parse(lastUpdate(a)), y = Date.parse(lastUpdate(b));
    return x === y ? 0 : (x > y ? dir : -dir);
  });
}
