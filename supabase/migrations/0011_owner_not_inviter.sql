-- ============================================================
-- 0011 — المالك ليس «داعياً في مناسبة غيره»، وصفٌّ واحد لكل حساب
--
-- عند إنشاء أي مناسبة يُنشأ لمالكها صفٌّ في inviters بحسابه نفسه،
-- ليظهر في قائمة الدعاة وتُنسب إليه دعواته. هذا صحيح ومقصود، لكنه
-- كان يُقرأ في «مناسباتي» على أنه «مناسبة أنا داعٍ فيها»، فتظهر
-- المناسبة الواحدة مرّتين: مالكاً وداعياً.
--
-- الإصلاح في الواجهة يستبعد صفّ المالك من تلك القائمة. وهنا نمنع
-- الحالة الأسوأ في القاعدة نفسها: أن يرتبط حسابٌ بصفَّين في المناسبة
-- الواحدة (يحدث لو فتح المالك رابط انضمام أحد دعاته وهو مسجَّل الدخول،
-- فيحتلّ صفَّه ويصير له صفّان).
-- ============================================================

-- ------------------------------------------------------------
-- إصلاح البيانات القائمة قبل فرض القيد.
-- لا نحذف صفوفاً (مدعوّوها مرتبطون بها) — نُفرغ profile_id من الصفوف
-- الزائدة فيعود الصفّ متاحاً لصاحبه الحقيقي عبر رابط الانضمام.
--
-- أيّ صفّ نُبقي؟ صفّ المالك المنشأ مع المناسبة (role_label = 'المالك')،
-- وإلا فالأقدم.
-- ------------------------------------------------------------
with ranked as (
  select i.id,
         row_number() over (
           partition by i.event_id, i.profile_id
           order by (i.role_label = 'المالك') desc, i.created_at, i.id
         ) as rn
  from public.inviters i
  where i.profile_id is not null
)
update public.inviters i
set profile_id = null,
    joined_at  = null
from ranked r
where r.id = i.id and r.rn > 1;

-- المالك لا يحتفظ إلا بصفّه الأصلي في مناسبته
with owner_rows as (
  select i.id,
         row_number() over (
           partition by i.event_id
           order by (i.role_label = 'المالك') desc, i.created_at, i.id
         ) as rn
  from public.inviters i
  join public.events e on e.id = i.event_id
  where i.profile_id is not null and i.profile_id = e.owner_id
)
update public.inviters i
set profile_id = null,
    joined_at  = null
from owner_rows o
where o.id = i.id and o.rn > 1;

-- حساب واحد لا يملك صفَّي داعٍ في المناسبة نفسها.
-- الصفوف التي لم يُطالَب بها بعد (profile_id = null) لا يشملها القيد.
create unique index if not exists inviters_event_profile_key
  on public.inviters (event_id, profile_id)
  where profile_id is not null;

-- ------------------------------------------------------------
-- المالك لا يُربط بصفّ داعٍ غير صفّه الأصلي في مناسبته.
-- صفّه الأول (المنشأ مع المناسبة) مسموح: هو مصدر نسبة دعواته إليه.
-- ------------------------------------------------------------
create or replace function public.guard_owner_inviter_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_count int;
begin
  if new.profile_id is null then
    return new;
  end if;

  select owner_id into v_owner from public.events where id = new.event_id;

  if v_owner is not null and v_owner = new.profile_id then
    select count(*) into v_count
    from public.inviters i
    where i.event_id = new.event_id
      and i.profile_id = new.profile_id
      and i.id is distinct from new.id;

    if v_count > 0 then
      raise exception 'OWNER_ALREADY_INVITER'
        using hint = 'مالك المناسبة له صفٌّ واحد فيها — لا يُضاف كداعٍ مرّة أخرى.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists inviters_owner_claim_guard on public.inviters;
create trigger inviters_owner_claim_guard
  before insert or update of profile_id on public.inviters
  for each row execute function public.guard_owner_inviter_claim();
