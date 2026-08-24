/**
 * صفة المستخدم تجاه مناسبة بعينها.
 *
 * الحساب واحد دائم، و«مالك» و«داعٍ» صفتان تُشتقّان من علاقته بالمناسبة
 * لا من دوره (SPEC §3). عند إنشاء أي مناسبة يُنشأ لمالكها صفٌّ في
 * `inviters` بحسابه نفسه ليظهر في قائمة الدعاة وتُنسب إليه دعواته —
 * وهذا الصفّ يجب ألّا يجعله «داعياً في مناسبة غيره».
 *
 * بلا هذا التمييز تظهر المناسبة الواحدة مرّتين في «مناسباتي»: مرّةً
 * كمناسبة يملكها، ومرّةً في «مناسبات أنا داعٍ فيها».
 */

/** أقلّ ما نحتاجه من صفّ الداعي لتحديد الصفة. */
export interface InviterRowLike {
  profile_id?: string | null;
  events?: { owner_id?: string | null } | null;
}

/** هل هذا الصفّ يمثّل المالك نفسه في مناسبته؟ */
export function isOwnEventInviterRow(row: InviterRowLike, userId: string): boolean {
  return row.events?.owner_id === userId;
}

/**
 * صفوف «أنا داعٍ فيها» الحقيقية: مناسبات يملكها غيري ودُعيت لأكون
 * داعياً فيها. تستبعد صفّ المالك في مناسبته، والصفوف بلا مناسبة.
 */
export function foreignInviterRows<T extends InviterRowLike>(
  rows: T[],
  userId: string,
): T[] {
  return rows.filter((row) => Boolean(row.events) && !isOwnEventInviterRow(row, userId));
}

/** صفة المستخدم تجاه مناسبة: مالكها، أو داعٍ فيها، أو لا صلة له بها. */
export type EventRelation = 'owner' | 'inviter' | 'none';

export function relationToEvent(
  { ownerId, inviterProfileId }: { ownerId: string | null; inviterProfileId?: string | null },
  userId: string,
): EventRelation {
  // المالك أولاً: من يملك المناسبة لا يُعامَل كداعٍ فيها ولو كان له صفّ
  if (ownerId && ownerId === userId) return 'owner';
  if (inviterProfileId && inviterProfileId === userId) return 'inviter';
  return 'none';
}
