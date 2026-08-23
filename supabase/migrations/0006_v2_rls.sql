-- ============================================================
-- برقية v2 — صلاحيات الأدوار الجديدة وعزل الدعاة
--
-- «تسريب مقاعد أو مدعوّي طرف لطرف آخر خطأ جسيم — خصوصاً بين أهل
-- العريس وأهل العروس» (SPEC §8.4). العزل هنا على مستوى قاعدة
-- البيانات لا الواجهة.
-- ============================================================

-- ---------- ١) توسيع is_admin لتشمل أدوار الأدمن الأربعة ----------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'admin_owner', 'admin_support', 'admin_reviewer', 'admin_finance')
      and is_active
  );
$$;

/** فحص صلاحية محددة حسب مصفوفة الصلاحيات (SPEC §10). */
create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and (
      p.role in ('admin', 'admin_owner')                                     -- المدير يملك كل شيء
      or (p_permission = 'manual_activation' and p.role = 'admin_support')
      or (p_permission = 'review_templates'  and p.role = 'admin_reviewer')
      or (p_permission = 'impersonate'       and p.role = 'admin_support')
      or (p_permission = 'finance'           and p.role = 'admin_finance')
    )
  );
$$;

/** صفّ الداعي الخاص بالمستخدم الحالي في مناسبة ما (أو null). */
create or replace function public.my_inviter_id(p_event_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.inviters
  where event_id = p_event_id and profile_id = auth.uid()
  limit 1;
$$;

/** هل المستخدم الحالي داعٍ في هذه المناسبة؟ */
create or replace function public.is_inviter_in(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.inviters
    where event_id = p_event_id and profile_id = auth.uid()
  );
$$;

-- ---------- ٢) events: الداعي يرى المناسبة لكن لا يعدّلها ----------
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated
  using (
    owner_id = auth.uid()
    or public.is_admin()
    or public.scans_event(id)
    or public.is_inviter_in(id)
  );

-- ---------- ٣) inviters ----------
drop policy if exists inviters_owner_all on public.inviters;
create policy inviters_owner_all on public.inviters for all to authenticated
  using (public.owns_event(event_id) or public.is_admin())
  with check (public.owns_event(event_id) or public.is_admin());

drop policy if exists inviters_self_read on public.inviters;
create policy inviters_self_read on public.inviters for select to authenticated
  using (profile_id = auth.uid());

-- الداعي يعدّل صفّه (قالبه ونصّه وصورته) — والحصة محميّة بتريغر أدناه
drop policy if exists inviters_self_update on public.inviters;
create policy inviters_self_update on public.inviters for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

/**
 * الحصة يوزّعها المالك وحده، والنص يملكه الداعي وحده (SPEC §8.2, §8.4).
 * RLS لا تقيّد عموداً بعينه، فنحرس الحقول الحسّاسة بتريغر.
 */
create or replace function public.guard_inviter_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_owner boolean;
begin
  if auth.uid() is null then
    return new;  -- كود خادم موثوق
  end if;

  select (e.owner_id = auth.uid()) into v_is_owner
  from public.events e where e.id = new.event_id;

  if coalesce(v_is_owner, false) or public.is_admin() then
    -- المالك لا يملك نصّ الداعي ولا قالبه ولا صورته
    if new.template_id is distinct from old.template_id
       or new.invite_vars is distinct from old.invite_vars
       or new.image_url is distinct from old.image_url then
      raise exception 'INVITER_CONTENT_IS_OWNED_BY_INVITER'
        using hint = 'نص الداعي وقالبه وصورته يملكها الداعي وحده.';
    end if;
    return new;
  end if;

  -- الداعي نفسه: يملك نصّه، ولا يملك حصته ولا صفته
  if new.profile_id = auth.uid() then
    if new.seats_quota is distinct from old.seats_quota then
      raise exception 'SEATS_QUOTA_IS_OWNED_BY_EVENT_OWNER'
        using hint = 'الحصة يوزّعها صاحب المناسبة وحده.';
    end if;
    if new.event_id is distinct from old.event_id
       or new.profile_id is distinct from old.profile_id
       or new.role_label is distinct from old.role_label then
      raise exception 'FORBIDDEN_FIELD_CHANGE';
    end if;
    return new;
  end if;

  raise exception 'FORBIDDEN';
end;
$$;

drop trigger if exists inviters_guard_fields on public.inviters;
create trigger inviters_guard_fields
  before update on public.inviters
  for each row execute function public.guard_inviter_fields();

/** مجموع حصص الدعاة ≤ رصيد المناسبة (SPEC §3). */
create or replace function public.guard_inviter_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quota integer;
  v_sum   integer;
begin
  select seats_quota into v_quota from public.events where id = new.event_id;
  select coalesce(sum(seats_quota), 0) into v_sum
  from public.inviters where event_id = new.event_id and id <> new.id;

  if v_sum + new.seats_quota > coalesce(v_quota, 0) then
    raise exception 'QUOTA_EXCEEDS_EVENT_SEATS'
      using hint = format('المتاح للتوزيع %s مقعداً فقط.', coalesce(v_quota,0) - v_sum);
  end if;
  return new;
end;
$$;

drop trigger if exists inviters_guard_quota on public.inviters;
create trigger inviters_guard_quota
  before insert or update of seats_quota on public.inviters
  for each row execute function public.guard_inviter_quota();

-- ---------- ٤) guests: الداعي يرى مدعوّيه فقط ----------
drop policy if exists guests_owner_all on public.guests;
create policy guests_owner_all on public.guests for all to authenticated
  using (public.owns_event(event_id) or public.is_admin())
  with check (public.owns_event(event_id) or public.is_admin());

drop policy if exists guests_scanner_read on public.guests;
create policy guests_scanner_read on public.guests for select to authenticated
  using (public.scans_event(event_id));

-- العزل الحاسم: مقيّد بـ inviter_id الخاص بالداعي
drop policy if exists guests_inviter_all on public.guests;
create policy guests_inviter_all on public.guests for all to authenticated
  using (inviter_id is not null and inviter_id = public.my_inviter_id(event_id))
  with check (inviter_id is not null and inviter_id = public.my_inviter_id(event_id));

-- ---------- ٥) دفتر العناوين: لمالكه وحده، ولا يظهر للأدمن ----------
alter table public.contacts       enable row level security;
alter table public.contact_groups enable row level security;

drop policy if exists contacts_owner_all on public.contacts;
create policy contacts_owner_all on public.contacts for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists contact_groups_owner_all on public.contact_groups;
create policy contact_groups_owner_all on public.contact_groups for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- ٦) سجل النشاط: قراءة للأدمن، وكتابة من الخادم ----------
alter table public.activity_logs enable row level security;

drop policy if exists activity_logs_admin_read on public.activity_logs;
create policy activity_logs_admin_read on public.activity_logs for select to authenticated
  using (public.is_admin());

drop policy if exists activity_logs_insert on public.activity_logs;
create policy activity_logs_insert on public.activity_logs for insert to authenticated
  with check (actor_id = auth.uid() or public.is_admin());

-- ---------- ٧) موافقات التسويق: الأدمن فقط ----------
alter table public.marketing_optins enable row level security;

drop policy if exists marketing_optins_admin on public.marketing_optins;
create policy marketing_optins_admin on public.marketing_optins for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- ٨) إعدادات المنصة: المدير وحده ----------
alter table public.platform_settings enable row level security;

drop policy if exists platform_settings_admin on public.platform_settings;
create policy platform_settings_admin on public.platform_settings for all to authenticated
  using (public.has_permission('whatsapp_settings'))
  with check (public.has_permission('whatsapp_settings'));

-- ---------- ٩) الملف الشخصي: الدور الافتراضي صار user ----------
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid() and role in ('user', 'owner'));

grant execute on function public.has_permission(text) to authenticated, service_role;
grant execute on function public.my_inviter_id(uuid)  to authenticated, service_role;
grant execute on function public.is_inviter_in(uuid)  to authenticated, service_role;
