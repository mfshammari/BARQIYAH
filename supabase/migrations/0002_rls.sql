-- ============================================================
-- برقية — أمان مستوى الصف (RLS)
-- لا جدول مكشوف: كل جدول عليه RLS + سياسات صريحة.
-- ============================================================

-- ---------- دوال مساعدة (SECURITY DEFINER لتفادي التكرار اللانهائي) ----------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.owns_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id and e.owner_id = auth.uid()
  );
$$;

create or replace function public.scans_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.scanners s
    where s.event_id = p_event_id and s.profile_id = auth.uid()
  );
$$;

-- الماسحون الذين أنشأهم هذا المالك (لعرض/إدارة حساباتهم)
create or replace function public.manages_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.scanners s
    join public.events e on e.id = s.event_id
    where s.profile_id = p_profile_id and e.owner_id = auth.uid()
  );
$$;

-- ---------- تفعيل RLS على كل الجداول ----------
alter table public.profiles             enable row level security;
alter table public.packages             enable row level security;
alter table public.templates            enable row level security;
alter table public.events               enable row level security;
alter table public.inviters             enable row level security;
alter table public.guests               enable row level security;
alter table public.scanners             enable row level security;
alter table public.integration_settings enable row level security;
alter table public.transactions         enable row level security;
alter table public.message_logs         enable row level security;

-- ---------- profiles ----------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin() or public.manages_profile(id));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- packages ----------
drop policy if exists packages_read on public.packages;
create policy packages_read on public.packages for select to authenticated
  using (active or public.is_admin());

drop policy if exists packages_admin_write on public.packages;
create policy packages_admin_write on public.packages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- templates ----------
-- القوالب العامة المعتمدة يراها الجميع، والخاصة يراها مالكها فقط
drop policy if exists templates_read on public.templates;
create policy templates_read on public.templates for select to authenticated
  using (
    public.is_admin()
    or owner_id = auth.uid()
    or (owner_id is null and status = 'approved')
  );

drop policy if exists templates_owner_insert on public.templates;
create policy templates_owner_insert on public.templates for insert to authenticated
  with check (owner_id = auth.uid() and status in ('draft', 'under_review'));

drop policy if exists templates_owner_update on public.templates;
create policy templates_owner_update on public.templates for update to authenticated
  using (owner_id = auth.uid() and status in ('draft', 'rejected'))
  with check (owner_id = auth.uid() and status in ('draft', 'under_review'));

drop policy if exists templates_admin_all on public.templates;
create policy templates_admin_all on public.templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- events ----------
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated
  using (owner_id = auth.uid() or public.is_admin() or public.scans_event(id));

drop policy if exists events_owner_insert on public.events;
create policy events_owner_insert on public.events for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists events_owner_update on public.events;
create policy events_owner_update on public.events for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists events_admin_all on public.events;
create policy events_admin_all on public.events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- inviters ----------
drop policy if exists inviters_owner_all on public.inviters;
create policy inviters_owner_all on public.inviters for all to authenticated
  using (public.owns_event(event_id) or public.is_admin())
  with check (public.owns_event(event_id) or public.is_admin());

drop policy if exists inviters_scanner_read on public.inviters;
create policy inviters_scanner_read on public.inviters for select to authenticated
  using (public.scans_event(event_id));

-- ---------- guests ----------
drop policy if exists guests_owner_all on public.guests;
create policy guests_owner_all on public.guests for all to authenticated
  using (public.owns_event(event_id) or public.is_admin())
  with check (public.owns_event(event_id) or public.is_admin());

drop policy if exists guests_scanner_read on public.guests;
create policy guests_scanner_read on public.guests for select to authenticated
  using (public.scans_event(event_id));

-- ---------- scanners ----------
drop policy if exists scanners_owner_all on public.scanners;
create policy scanners_owner_all on public.scanners for all to authenticated
  using (public.owns_event(event_id) or public.is_admin())
  with check (public.owns_event(event_id) or public.is_admin());

drop policy if exists scanners_self_read on public.scanners;
create policy scanners_self_read on public.scanners for select to authenticated
  using (profile_id = auth.uid());

-- ---------- integration_settings (الأدمن فقط) ----------
drop policy if exists integration_admin_all on public.integration_settings;
create policy integration_admin_all on public.integration_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- transactions ----------
drop policy if exists transactions_read on public.transactions;
create policy transactions_read on public.transactions for select to authenticated
  using (public.owns_event(event_id) or public.is_admin());

drop policy if exists transactions_admin_write on public.transactions;
create policy transactions_admin_write on public.transactions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- message_logs ----------
drop policy if exists message_logs_read on public.message_logs;
create policy message_logs_read on public.message_logs for select to authenticated
  using (public.owns_event(event_id) or public.is_admin());

drop policy if exists message_logs_admin_write on public.message_logs;
create policy message_logs_admin_write on public.message_logs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ملاحظة: صفحات المدعو العامة (RSVP / الباركود) وWebhook واتساب تمرّ عبر
-- service role على الخادم فقط — لا توجد سياسة anon على أي جدول.
