-- ============================================================
-- 0017 — ربط الداعي بحسابه تلقائياً بالجوال (المرحلة ٦)
--
-- حين يضيف المالك داعياً برقم جوال لا حساب له، يبقى الصف بلا profile_id.
-- بعد أي تسجيل أو دخول ناجح تُستدعى claim_inviter_rows فتربط كل صفوف
-- inviters حيث phone = profiles.phone وprofile_id فارغ بالحساب الحالي
-- وتضبط joined_at — محترمةً قيد inviters_event_profile_key وحاجز
-- guard_owner_inviter_claim (المالك لا يُربط كداعٍ في مناسبته).
--
-- تُستدعى من الخادم بمفتاح الخدمة (auth.uid() فارغ) ويُمرَّر المعرّف،
-- لأن حاجز guard_inviter_fields يمنع صاحب الجلسة من تغيير profile_id بنفسه.
-- ============================================================

create or replace function public.claim_inviter_rows(p_profile_id uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid   uuid := coalesce(p_profile_id, auth.uid());
  v_phone text;
  v_count integer := 0;
  r       record;
begin
  if v_uid is null then
    return 0;
  end if;

  -- من الويب: لا يطالب أحد بصفوف غيره
  if auth.uid() is not null and auth.uid() <> v_uid and not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select phone into v_phone from public.profiles where id = v_uid;
  if v_phone is null or length(trim(v_phone)) = 0 then
    return 0;
  end if;

  for r in
    select i.id
    from public.inviters i
    join public.events e on e.id = i.event_id
    where i.phone = v_phone
      and i.profile_id is null
      and e.owner_id <> v_uid                                   -- المالك ليس داعياً في مناسبته
      and not exists (                                          -- صفّ واحد لكل حساب في المناسبة
        select 1 from public.inviters x
        where x.event_id = i.event_id and x.profile_id = v_uid
      )
  loop
    begin
      update public.inviters
         set profile_id = v_uid, joined_at = coalesce(joined_at, now())
       where id = r.id and profile_id is null;
      if found then
        v_count := v_count + 1;
      end if;
    exception when unique_violation or raise_exception then
      -- قيد الفرادة أو حاجز المالك: نتخطّى هذا الصف ونكمل
      null;
    end;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.claim_inviter_rows(uuid) from public, anon, authenticated;
grant execute on function public.claim_inviter_rows(uuid) to service_role;
