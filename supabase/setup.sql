-- ============================================================
-- برقية — الإعداد الكامل لقاعدة البيانات في ملف واحد
--
-- مولّد آلياً من supabase/migrations — لا تعدّله يدوياً.
-- لإعادة توليده: node scripts/build-setup-sql.mjs
--
-- الاستخدام: انسخ هذا الملف كاملاً والصقه في
-- Supabase Studio ← SQL Editor ← New query ← Run
--
-- الملف آمن لإعادة التشغيل: يمكن تنفيذه أكثر من مرة دون ضرر.
-- ============================================================

-- ==========================================================
-- ملف: 0001_init.sql
-- ==========================================================

-- ============================================================
-- برقية — المخطط الأساسي (الجداول + الفهارس)
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- الأنواع (Enums) ----------
do $$ begin
  create type user_role as enum ('admin', 'owner', 'scanner');
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_status as enum ('pending', 'active', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type template_status as enum ('draft', 'under_review', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type whatsapp_category as enum ('marketing', 'utility');
exception when duplicate_object then null; end $$;

do $$ begin
  create type guest_status as enum ('draft', 'sent', 'accepted', 'declined', 'expired', 'attended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type transaction_type as enum ('purchase', 'upgrade', 'manual_activation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type transaction_status as enum ('pending', 'paid', 'failed', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type occasion_type as enum ('wedding', 'engagement', 'graduation', 'other');
exception when duplicate_object then null; end $$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role not null default 'owner',
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now()
);

-- ---------- packages ----------
create table if not exists public.packages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  seats       integer not null check (seats > 0),
  price       numeric(10,2) not null default 0 check (price >= 0),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- templates ----------
-- owner_id = null  →  قالب عام يبنيه الأدمن
create table if not exists public.templates (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid references public.profiles(id) on delete cascade,
  name               text not null,
  body_text          text not null default '',
  image_url          text,
  status             template_status not null default 'draft',
  rejection_reason   text,
  whatsapp_category  whatsapp_category not null default 'utility',
  meta_template_name text,
  created_at         timestamptz not null default now()
);
create index if not exists templates_owner_idx  on public.templates(owner_id);
create index if not exists templates_status_idx on public.templates(status);

-- ---------- events ----------
create table if not exists public.events (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  package_id     uuid references public.packages(id) on delete set null,
  occasion_type  occasion_type not null default 'wedding',
  event_date     date not null,
  host_name      text not null,                   -- الدعوة باسم مين
  buyer_name     text,
  buyer_phone    text,
  template_id    uuid references public.templates(id) on delete set null,
  image_url      text,
  seats_quota    integer not null default 0 check (seats_quota >= 0),
  status         event_status not null default 'pending',
  created_at     timestamptz not null default now()
);
create index if not exists events_owner_idx  on public.events(owner_id);
create index if not exists events_status_idx on public.events(status);

-- ---------- inviters (الدعاة الفرعيون) ----------
create table if not exists public.inviters (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  name        text not null,
  role_label  text not null default 'داعٍ',
  created_at  timestamptz not null default now()
);
create index if not exists inviters_event_idx on public.inviters(event_id);

-- ---------- guests ----------
create table if not exists public.guests (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  inviter_id       uuid references public.inviters(id) on delete set null,
  name             text not null,
  phone            text not null,
  max_seats        integer not null default 1 check (max_seats between 1 and 50),
  confirmed_seats  integer check (confirmed_seats >= 0),
  status           guest_status not null default 'draft',
  invite_token     uuid not null default gen_random_uuid(),
  qr_token         uuid,
  scans_used       integer not null default 0 check (scans_used >= 0),
  sent_at          timestamptz,
  responded_at     timestamptz,
  attended_at      timestamptz,
  created_at       timestamptz not null default now(),
  constraint guests_invite_token_key unique (invite_token),
  constraint guests_qr_token_key unique (qr_token),
  constraint guests_event_phone_key unique (event_id, phone)
);
create index if not exists guests_event_idx   on public.guests(event_id);
create index if not exists guests_inviter_idx on public.guests(inviter_id);
create index if not exists guests_status_idx  on public.guests(event_id, status);
create index if not exists guests_phone_idx   on public.guests(phone);

-- ---------- scanners ----------
create table if not exists public.scanners (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  label       text not null default 'ماسح',
  created_at  timestamptz not null default now(),
  constraint scanners_event_profile_key unique (event_id, profile_id)
);
create index if not exists scanners_event_idx   on public.scanners(event_id);
create index if not exists scanners_profile_idx on public.scanners(profile_id);

-- ---------- integration_settings (إعدادات Meta المركزية) ----------
create table if not exists public.integration_settings (
  id               uuid primary key default gen_random_uuid(),
  phone_number_id  text,
  waba_id          text,
  access_token     text,
  verify_token     text,
  updated_at       timestamptz not null default now(),
  singleton        boolean not null default true,
  constraint integration_settings_singleton_key unique (singleton)
);

-- ---------- transactions ----------
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  package_id  uuid references public.packages(id) on delete set null,
  amount      numeric(10,2) not null default 0,
  type        transaction_type not null default 'manual_activation',
  status      transaction_status not null default 'paid',
  seats_added integer not null default 0,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists transactions_event_idx on public.transactions(event_id);

-- ---------- message_logs (سجل رسائل واتساب — للتتبّع ووضع المحاكاة) ----------
create table if not exists public.message_logs (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid references public.events(id) on delete cascade,
  guest_id    uuid references public.guests(id) on delete cascade,
  kind        text not null,          -- invitation | qr | text
  provider    text not null,          -- mock | meta
  to_phone    text,
  status      text not null,          -- sent | failed
  message_id  text,
  error       text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists message_logs_event_idx on public.message_logs(event_id);
create index if not exists message_logs_guest_idx on public.message_logs(guest_id);

-- ---------- إنشاء profile تلقائياً عند التسجيل ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'owner'),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ==========================================================
-- ملف: 0002_rls.sql
-- ==========================================================

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


-- ==========================================================
-- ملف: 0003_functions.sql
-- ==========================================================

-- ============================================================
-- برقية — منطق الرصيد والحجز والمسح (دوال ذرّية داخل قاعدة البيانات)
--
-- الرصيد بالمقاعد (أشخاص) لا بعدد الدعوات، بثلاث حالات:
--   مؤكّد  = مجموع confirmed_seats للحالات accepted/attended
--   محجوز  = مجموع max_seats للحالة sent (ننتظر الرد فنحجز الحد الأقصى)
--   متاح   = seats_quota - محجوز - مؤكّد
-- ============================================================

-- ---------- 1) حساب الرصيد ----------
create or replace function public.event_balance(p_event_id uuid)
returns table (
  seats_quota    integer,
  held           integer,
  confirmed      integer,
  available      integer,
  messages_used  integer,
  total_guests   integer,
  cnt_draft      integer,
  cnt_sent       integer,
  cnt_accepted   integer,
  cnt_declined   integer,
  cnt_expired    integer,
  cnt_attended   integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.seats_quota,
    coalesce(h.held, 0)                                              as held,
    coalesce(c.confirmed, 0)                                         as confirmed,
    e.seats_quota - coalesce(h.held, 0) - coalesce(c.confirmed, 0)   as available,
    coalesce(g.messages_used, 0)                                     as messages_used,
    coalesce(g.total_guests, 0)                                      as total_guests,
    coalesce(g.cnt_draft, 0), coalesce(g.cnt_sent, 0), coalesce(g.cnt_accepted, 0),
    coalesce(g.cnt_declined, 0), coalesce(g.cnt_expired, 0), coalesce(g.cnt_attended, 0)
  from public.events e
  left join lateral (
    select sum(max_seats)::int as held
    from public.guests where event_id = e.id and status = 'sent'
  ) h on true
  left join lateral (
    select sum(coalesce(confirmed_seats, 0))::int as confirmed
    from public.guests where event_id = e.id and status in ('accepted', 'attended')
  ) c on true
  left join lateral (
    select
      count(*) filter (where status <> 'draft')::int as messages_used,
      count(*)::int                                   as total_guests,
      count(*) filter (where status = 'draft')::int    as cnt_draft,
      count(*) filter (where status = 'sent')::int     as cnt_sent,
      count(*) filter (where status = 'accepted')::int as cnt_accepted,
      count(*) filter (where status = 'declined')::int as cnt_declined,
      count(*) filter (where status = 'expired')::int  as cnt_expired,
      count(*) filter (where status = 'attended')::int as cnt_attended
    from public.guests where event_id = e.id
  ) g on true
  where e.id = p_event_id
    and (e.owner_id = auth.uid() or public.is_admin() or public.scans_event(e.id) or auth.uid() is null);
$$;

-- ---------- 2) حجز المقاعد وتعليم الدعوات كمُرسَلة ----------
-- تُستدعى قبل الإرسال الفعلي عبر واتساب. تقفل صف المناسبة لمنع تجاوز الرصيد
-- عند الإرسال المتزامن. ترجع لكل مدعو: هل نجح الحجز ولماذا لا.
create or replace function public.reserve_seats_for_send(
  p_event_id uuid,
  p_guest_ids uuid[]
)
returns table (guest_id uuid, ok boolean, reason text, missing_seats integer)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_event      public.events%rowtype;
  v_guest      public.guests%rowtype;
  v_held       integer;
  v_confirmed  integer;
  v_available  integer;
begin
  -- قفل صف المناسبة (تسلسل عمليات الإرسال على نفس المناسبة)
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if not (v_event.owner_id = auth.uid() or public.is_admin() or auth.uid() is null) then
    raise exception 'FORBIDDEN';
  end if;

  if v_event.status <> 'active' then
    return query
      select gid, false, 'EVENT_NOT_ACTIVE'::text, 0 from unnest(p_guest_ids) as gid;
    return;
  end if;

  select coalesce(sum(max_seats), 0)::int into v_held
    from public.guests where event_id = p_event_id and status = 'sent';
  select coalesce(sum(coalesce(confirmed_seats, 0)), 0)::int into v_confirmed
    from public.guests where event_id = p_event_id and status in ('accepted', 'attended');
  v_available := v_event.seats_quota - v_held - v_confirmed;

  foreach guest_id in array p_guest_ids loop
    select * into v_guest from public.guests where id = guest_id and event_id = p_event_id;

    if not found then
      ok := false; reason := 'GUEST_NOT_FOUND'; missing_seats := 0;
      return next; continue;
    end if;

    if v_guest.status <> 'draft' then
      ok := false; reason := 'ALREADY_SENT'; missing_seats := 0;
      return next; continue;
    end if;

    if v_guest.max_seats > v_available then
      ok := false; reason := 'INSUFFICIENT_SEATS';
      missing_seats := v_guest.max_seats - greatest(v_available, 0);
      return next; continue;
    end if;

    update public.guests
       set status = 'sent', sent_at = now()
     where id = v_guest.id;

    v_available := v_available - v_guest.max_seats;
    ok := true; reason := 'RESERVED'; missing_seats := 0;
    return next;
  end loop;
end;
$$;

-- ---------- 3) التراجع عن الحجز عند فشل الإرسال ----------
create or replace function public.release_seat_hold(p_guest_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.guests
     set status = 'draft', sent_at = null
   where id = p_guest_id
     and status = 'sent'
     and (public.owns_event(event_id) or public.is_admin() or auth.uid() is null);
end;
$$;

-- ---------- 4) تأكيد الحضور (RSVP) ----------
-- يقبل invite_token أو qr_token. يولّد qr_token عند أول تأكيد.
create or replace function public.rsvp_accept(p_token uuid, p_seats integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_guest public.guests%rowtype;
  v_qr    uuid;
begin
  select * into v_guest from public.guests
   where invite_token = p_token or qr_token = p_token
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  end if;

  if v_guest.status in ('draft') then
    return jsonb_build_object('ok', false, 'reason', 'NOT_SENT');
  end if;

  if p_seats is null or p_seats < 1 or p_seats > v_guest.max_seats then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_SEATS', 'max_seats', v_guest.max_seats);
  end if;

  if v_guest.status = 'attended' then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_ATTENDED');
  end if;

  -- المقاعد المؤكَّدة ≤ الحد الأقصى المحجوز أصلاً، فلا يتجاوز الرصيد أبداً
  v_qr := coalesce(v_guest.qr_token, gen_random_uuid());

  update public.guests
     set status          = 'accepted',
         confirmed_seats = p_seats,
         qr_token        = v_qr,
         responded_at    = now()
   where id = v_guest.id;

  return jsonb_build_object(
    'ok', true, 'guest_id', v_guest.id, 'event_id', v_guest.event_id,
    'qr_token', v_qr, 'confirmed_seats', p_seats, 'name', v_guest.name, 'phone', v_guest.phone
  );
end;
$$;

-- ---------- 5) الاعتذار ----------
create or replace function public.rsvp_decline(p_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_guest public.guests%rowtype;
begin
  select * into v_guest from public.guests
   where invite_token = p_token or qr_token = p_token
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  end if;

  if v_guest.status = 'attended' then
    return jsonb_build_object('ok', false, 'reason', 'ALREADY_ATTENDED');
  end if;

  update public.guests
     set status = 'declined', confirmed_seats = 0, responded_at = now()
   where id = v_guest.id;

  return jsonb_build_object('ok', true, 'guest_id', v_guest.id, 'event_id', v_guest.event_id, 'name', v_guest.name);
end;
$$;

-- ---------- 6) مسح الباركود (تحقّق أونلاين، أحادي الاستخدام حتى اكتمال المقاعد) ----------
create or replace function public.scan_qr(p_qr_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_guest     public.guests%rowtype;
  v_event     public.events%rowtype;
  v_inviter   text;
  v_remaining integer;
begin
  select * into v_guest from public.guests where qr_token = p_qr_token for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_CODE');
  end if;

  select * into v_event from public.events where id = v_guest.event_id;

  -- الصلاحية: ماسح مُسنَد لهذه المناسبة، أو مالكها، أو أدمن
  if not (public.scans_event(v_guest.event_id) or v_event.owner_id = auth.uid() or public.is_admin()) then
    return jsonb_build_object('ok', false, 'reason', 'FORBIDDEN');
  end if;

  if v_guest.status not in ('accepted', 'attended') then
    return jsonb_build_object('ok', false, 'reason', 'NOT_CONFIRMED', 'name', v_guest.name);
  end if;

  if v_guest.scans_used >= coalesce(v_guest.confirmed_seats, 0) then
    return jsonb_build_object(
      'ok', false, 'reason', 'CODE_EXHAUSTED', 'name', v_guest.name,
      'seats', coalesce(v_guest.confirmed_seats, 0), 'scans_used', v_guest.scans_used
    );
  end if;

  select name into v_inviter from public.inviters where id = v_guest.inviter_id;

  update public.guests
     set scans_used  = scans_used + 1,
         status      = case when scans_used + 1 >= coalesce(confirmed_seats, 0) then 'attended'::guest_status else status end,
         attended_at = case when attended_at is null then now() else attended_at end
   where id = v_guest.id;

  v_remaining := coalesce(v_guest.confirmed_seats, 0) - (v_guest.scans_used + 1);

  return jsonb_build_object(
    'ok', true, 'reason', 'CHECKED_IN', 'name', v_guest.name,
    'seats', coalesce(v_guest.confirmed_seats, 0),
    'scans_used', v_guest.scans_used + 1,
    'remaining', v_remaining,
    'inviter', coalesce(v_inviter, ''),
    'completed', v_remaining <= 0
  );
end;
$$;

-- ---------- 7) تفعيل مناسبة / إضافة رصيد (الأدمن) ----------
create or replace function public.admin_activate_event(
  p_event_id uuid,
  p_package_id uuid,
  p_type transaction_type default 'manual_activation',
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_pkg   public.packages%rowtype;
  v_event public.events%rowtype;
  v_seats integer;
begin
  if not (public.is_admin() or auth.uid() is null) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'EVENT_NOT_FOUND');
  end if;

  select * into v_pkg from public.packages where id = p_package_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'PACKAGE_NOT_FOUND');
  end if;

  -- التفعيل الأول يضبط الرصيد، والترقية تضيف فوقه
  if p_type = 'upgrade' then
    v_seats := v_event.seats_quota + v_pkg.seats;
  else
    v_seats := greatest(v_event.seats_quota, v_pkg.seats);
  end if;

  update public.events
     set status      = 'active',
         seats_quota = v_seats,
         package_id  = case when p_type = 'upgrade' then package_id else p_package_id end
   where id = p_event_id;

  insert into public.transactions (event_id, package_id, amount, type, status, seats_added, note)
  values (p_event_id, p_package_id, v_pkg.price, p_type, 'paid', v_pkg.seats, p_note);

  return jsonb_build_object('ok', true, 'seats_quota', v_seats);
end;
$$;

-- ---------- الصلاحيات ----------
revoke all on function public.reserve_seats_for_send(uuid, uuid[]) from public, anon;
revoke all on function public.release_seat_hold(uuid)             from public, anon;
revoke all on function public.rsvp_accept(uuid, integer)          from public, anon;
revoke all on function public.rsvp_decline(uuid)                  from public, anon;
revoke all on function public.scan_qr(uuid)                       from public, anon;
revoke all on function public.admin_activate_event(uuid, uuid, transaction_type, text) from public, anon;
revoke all on function public.event_balance(uuid)                 from public, anon;

grant execute on function public.event_balance(uuid)                 to authenticated, service_role;
grant execute on function public.reserve_seats_for_send(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.release_seat_hold(uuid)             to authenticated, service_role;
grant execute on function public.scan_qr(uuid)                       to authenticated, service_role;
grant execute on function public.admin_activate_event(uuid, uuid, transaction_type, text) to authenticated, service_role;
-- دوال RSVP تُستدعى من الخادم فقط (service role) لأن المدعو بلا حساب
grant execute on function public.rsvp_accept(uuid, integer) to service_role;
grant execute on function public.rsvp_decline(uuid)         to service_role;


-- ==========================================================
-- ملف: 0004_profile_safety.sql
-- ==========================================================

-- ============================================================
-- برقية — حماية الأدوار وشبكة أمان لإنشاء الملف الشخصي
--
-- المسار الأساسي هو تريغر on_auth_user_created على auth.users.
-- لكن إن تعذّر إنشاء التريغر (صلاحيات المشروع)، أو أُنشئ مستخدم
-- بطريقة أخرى، يبقى المستخدم بلا profile فيتعذّر عليه الدخول نهائياً.
-- هذا الملف يفتح مساراً بديلاً آمناً.
-- ============================================================

-- يسمح للمستخدم بإنشاء ملفه الشخصي هو فقط، وبدور owner حصراً
-- (فلا يستطيع أحد ترقية نفسه إلى admin أو scanner من هنا).
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid() and role = 'owner');

/**
 * تُستدعى بعد تسجيل الدخول: تُعيد ملف المستخدم، وتُنشئه بدور owner
 * إن لم يكن موجوداً. لا تلمس ملفاً قائماً، فلا تُغيّر دور أحد.
 */
create or replace function public.ensure_profile(p_full_name text default null)
returns public.profiles
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if found then
    return v_profile;
  end if;

  insert into public.profiles (id, role, full_name)
  values (auth.uid(), 'owner', p_full_name)
  on conflict (id) do nothing;

  select * into v_profile from public.profiles where id = auth.uid();
  return v_profile;
end;
$$;

revoke all on function public.ensure_profile(text) from public, anon;
grant execute on function public.ensure_profile(text) to authenticated, service_role;


-- ============================================================
-- منع ترقية الصلاحيات (privilege escalation)
--
-- سياسة profiles_update_self تسمح للمستخدم بتعديل صفّه هو، لكن RLS
-- لا تستطيع تقييد عمود بعينه — فكان بإمكان أي مستخدم مسجّل تنفيذ:
--     update profiles set role = 'admin' where id = auth.uid();
-- ويصبح أدمن على المنصة كلها. هذا التريغر يسدّ الثغرة.
-- ============================================================

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- كود الخادم الموثوق (service role) لا يمرّ بجلسة مستخدم:
  -- إنشاء حسابات الماسحين يحتاج ضبط الدور، فيُسمح له.
  if auth.uid() is null then
    return new;
  end if;

  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'ROLE_CHANGE_FORBIDDEN'
      using hint = 'تغيير الدور من صلاحية الأدمن وحده.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();


-- ==========================================================
-- ملف: 0005_v2_schema.sql
-- ==========================================================

-- ============================================================
-- برقية v2 — توسيع المخطط حسب SPEC.md
--
-- إضافي بالكامل: لا يحذف جدولاً ولا عموداً قائماً، ولا يفقد بيانات.
-- آمن لإعادة التشغيل.
-- ============================================================

-- ---------- ١) أدوار الأدمن الأربعة ----------
-- user يحل محل owner (حساب واحد للعميل، وكونه مالكاً أو داعياً صفة تُشتق
-- من علاقته بالمناسبة لا من الدور).
do $$ begin
  alter type user_role add value if not exists 'admin_owner';
  alter type user_role add value if not exists 'admin_support';
  alter type user_role add value if not exists 'admin_reviewer';
  alter type user_role add value if not exists 'admin_finance';
  alter type user_role add value if not exists 'user';
exception when others then null; end $$;

alter table public.profiles add column if not exists is_active boolean not null default true;

-- ---------- ٢) أنواع جديدة ----------
do $$ begin
  create type payment_method as enum ('gateway', 'bank_transfer', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_direction as enum ('outbound', 'inbound');
exception when duplicate_object then null; end $$;

do $$ begin
  alter type occasion_type add value if not exists 'engagement_contract';  -- عقد قران
  alter type occasion_type add value if not exists 'newborn';              -- مولود جديد
  alter type occasion_type add value if not exists 'official';             -- مناسبة رسمية
exception when others then null; end $$;

do $$ begin
  alter type event_status add value if not exists 'unpaid';
exception when others then null; end $$;

do $$ begin
  alter type guest_status add value if not exists 'failed';
exception when others then null; end $$;

-- ---------- ٣) توسيع events ----------
alter table public.events
  add column if not exists internal_name        text,
  add column if not exists celebrant_primary    text,
  add column if not exists celebrant_secondary  text,
  add column if not exists event_date_hijri     text,
  add column if not exists event_weekday        text,
  add column if not exists event_time           time,
  add column if not exists venue                text,
  add column if not exists activated_at         timestamptz,
  add column if not exists activated_by         uuid references public.profiles(id) on delete set null;

-- event_date الحالي هو الميلادي — نبقيه ونضيف اسماً واضحاً كعرض
comment on column public.events.event_date is 'التاريخ الميلادي (event_date_gregorian في SPEC)';

create index if not exists events_date_idx on public.events(event_date);

-- ---------- ٤) توسيع inviters: الداعي حساب وحصة ونصّ ----------
alter table public.inviters
  add column if not exists profile_id   uuid references public.profiles(id) on delete set null,
  add column if not exists phone        text,
  add column if not exists side_label   text,
  add column if not exists seats_quota  integer not null default 0 check (seats_quota >= 0),
  add column if not exists template_id  uuid references public.templates(id) on delete set null,
  add column if not exists invite_vars  jsonb not null default '{}'::jsonb,
  add column if not exists image_url    text,
  add column if not exists invite_token uuid not null default gen_random_uuid(),
  add column if not exists joined_at    timestamptz;

create unique index if not exists inviters_invite_token_key on public.inviters(invite_token);
create index if not exists inviters_profile_idx on public.inviters(profile_id);
create unique index if not exists inviters_event_phone_key
  on public.inviters(event_id, phone) where phone is not null;

-- ---------- ٥) توسيع guests ----------
alter table public.guests
  add column if not exists failure_reason text,
  add column if not exists contact_id     uuid;

-- ---------- ٦) توسيع templates ----------
alter table public.templates
  add column if not exists meta_status text;

-- ---------- ٧) توسيع transactions ----------
alter table public.transactions
  add column if not exists method      payment_method not null default 'manual',
  add column if not exists gateway_ref text,
  add column if not exists paid_at     timestamptz;

create unique index if not exists transactions_gateway_ref_key
  on public.transactions(gateway_ref) where gateway_ref is not null;

-- ---------- ٨) توسيع message_logs ----------
alter table public.message_logs
  add column if not exists direction       message_direction not null default 'outbound',
  add column if not exists inviter_id      uuid references public.inviters(id) on delete set null,
  add column if not exists template_name   text,
  add column if not exists meta_message_id text,
  add column if not exists error_code      text,
  add column if not exists cost            numeric(10,4);

-- ---------- ٩) دفتر العناوين الدائم ----------
create table if not exists public.contact_groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  constraint contact_groups_owner_name_key unique (owner_id, name)
);
create index if not exists contact_groups_owner_idx on public.contact_groups(owner_id);

create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  phone        text not null,
  group_label  text,
  notes        text,
  created_at   timestamptz not null default now(),
  constraint contacts_owner_phone_key unique (owner_id, phone)
);
create index if not exists contacts_owner_idx on public.contacts(owner_id);
create index if not exists contacts_group_idx on public.contacts(owner_id, group_label);

do $$ begin
  alter table public.guests
    add constraint guests_contact_fk foreign key (contact_id)
    references public.contacts(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------- ١٠) سجل النشاط ----------
-- actor_id فارغ = النظام (مثل التفعيل التلقائي بعد الدفع)
create table if not exists public.activity_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles(id) on delete set null,
  action       text not null,
  target_type  text,
  target_id    uuid,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists activity_logs_actor_idx  on public.activity_logs(actor_id);
create index if not exists activity_logs_target_idx on public.activity_logs(target_type, target_id);
create index if not exists activity_logs_time_idx   on public.activity_logs(created_at desc);

-- ---------- ١١) موافقات التسويق ----------
-- الجدول الوحيد المسموح استخدامه للتسويق (سياسة البيانات §7)
create table if not exists public.marketing_optins (
  id            uuid primary key default gen_random_uuid(),
  phone         text not null,
  source        text not null,
  event_id      uuid references public.events(id) on delete set null,
  consented_at  timestamptz not null default now(),
  constraint marketing_optins_phone_source_key unique (phone, source)
);

-- ---------- ١٢) إعدادات المنصة ----------
-- امتداد لـ integration_settings: مفاتيح الدفع وإعدادات عامة
create table if not exists public.platform_settings (
  id                     uuid primary key default gen_random_uuid(),
  payment_provider       text not null default 'manual',
  moyasar_publishable_key text,
  payment_webhook_secret text,
  sending_paused         boolean not null default false,
  updated_at             timestamptz not null default now(),
  singleton              boolean not null default true,
  constraint platform_settings_singleton_key unique (singleton)
);

-- إيقاف إرسال عميل مؤقتاً (حماية الرقم المشترك §6)
alter table public.profiles
  add column if not exists sending_paused boolean not null default false,
  add column if not exists paused_reason  text;


-- ==========================================================
-- ملف: 0006_v2_rls.sql
-- ==========================================================

-- ============================================================
-- برقية v2 — صلاحيات الأدوار الجديدة وعزل الدعاة
--
-- «تسريب مقاعد أو مدعوّي طرف لطرف آخر خطأ جسيم — خصوصاً بين أهل
-- العريس وأهل العروس» (SPEC §8.4). العزل هنا على مستوى قاعدة
-- البيانات لا الواجهة.
-- ============================================================

-- ---------- ١) توسيع is_admin لتشمل أدوار الأدمن الأربعة ----------
--
-- ملاحظة مهمة: تُقارَن الأدوار كنص (role::text) لا كقيم enum.
-- Postgres يمنع استخدام قيمة enum أُضيفت للتو في نفس المعاملة
-- (55P04: unsafe use of new value)، ومحرر SQL في Supabase ينفّذ
-- الملف كله كمعاملة واحدة. المقارنة النصية تتفادى ذلك تماماً.
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
      and role::text in ('admin', 'admin_owner', 'admin_support', 'admin_reviewer', 'admin_finance')
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
      p.role::text in ('admin', 'admin_owner')                                -- المدير يملك كل شيء
      or (p_permission = 'manual_activation' and p.role::text = 'admin_support')
      or (p_permission = 'review_templates'  and p.role::text = 'admin_reviewer')
      or (p_permission = 'impersonate'       and p.role::text = 'admin_support')
      or (p_permission = 'finance'           and p.role::text = 'admin_finance')
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
  with check (id = auth.uid() and role::text in ('user', 'owner'));

grant execute on function public.has_permission(text) to authenticated, service_role;
grant execute on function public.my_inviter_id(uuid)  to authenticated, service_role;
grant execute on function public.is_inviter_in(uuid)  to authenticated, service_role;


-- ==========================================================
-- ملف: 0007_inviter_balance.sql
-- ==========================================================

-- ============================================================
-- برقية v2 — رصيد الداعي داخل حصته
--
-- «احجز المقاعد من حصة الداعي» (SPEC §6)، و«حصته بثلاث حالات محسوبة
-- داخل حصته فقط — لا يرى إجمالي المناسبة ولا مقاعد بقية الدعاة» (§8.4).
-- ============================================================

/**
 * رصيد داعٍ بعينه: مؤكّد ومحجوز ومتاح — كلها داخل حصته وحدها.
 * يراه الداعي نفسه، ومالك المناسبة، والأدمن.
 */
create or replace function public.inviter_balance(p_inviter_id uuid)
returns table (
  seats_quota   integer,
  held          integer,
  confirmed     integer,
  available     integer,
  messages_used integer,
  total_guests  integer,
  cnt_draft     integer,
  cnt_sent      integer,
  cnt_accepted  integer,
  cnt_declined  integer,
  cnt_expired   integer,
  cnt_attended  integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.seats_quota,
    coalesce(h.held, 0),
    coalesce(c.confirmed, 0),
    i.seats_quota - coalesce(h.held, 0) - coalesce(c.confirmed, 0),
    coalesce(g.messages_used, 0),
    coalesce(g.total_guests, 0),
    coalesce(g.cnt_draft, 0), coalesce(g.cnt_sent, 0), coalesce(g.cnt_accepted, 0),
    coalesce(g.cnt_declined, 0), coalesce(g.cnt_expired, 0), coalesce(g.cnt_attended, 0)
  from public.inviters i
  left join lateral (
    select sum(max_seats)::int as held
    from public.guests where inviter_id = i.id and status = 'sent'
  ) h on true
  left join lateral (
    select sum(coalesce(confirmed_seats, 0))::int as confirmed
    from public.guests where inviter_id = i.id and status in ('accepted', 'attended')
  ) c on true
  left join lateral (
    select
      count(*) filter (where status <> 'draft')::int as messages_used,
      count(*)::int                                   as total_guests,
      count(*) filter (where status = 'draft')::int    as cnt_draft,
      count(*) filter (where status = 'sent')::int     as cnt_sent,
      count(*) filter (where status = 'accepted')::int as cnt_accepted,
      count(*) filter (where status = 'declined')::int as cnt_declined,
      count(*) filter (where status = 'expired')::int  as cnt_expired,
      count(*) filter (where status = 'attended')::int as cnt_attended
    from public.guests where inviter_id = i.id
  ) g on true
  where i.id = p_inviter_id
    and (
      i.profile_id = auth.uid()
      or public.owns_event(i.event_id)
      or public.is_admin()
      or auth.uid() is null
    );
$$;

/**
 * حجز المقاعد للإرسال من حصة داعٍ بعينه.
 *
 * يقفل صفّ الداعي فلا يتجاوز إرسالان متزامنان حصته. ويتحقق أيضاً من
 * رصيد المناسبة الكلي: الحصص قد تكون موزّعة بالكامل بينما رصيد المناسبة
 * استُهلك بمقاعد مؤكّدة أكثر مما توقّع المالك.
 */
create or replace function public.reserve_seats_for_inviter(
  p_inviter_id uuid,
  p_guest_ids uuid[]
)
returns table (guest_id uuid, ok boolean, reason text, missing_seats integer)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_inviter   public.inviters%rowtype;
  v_event     public.events%rowtype;
  v_guest     public.guests%rowtype;
  v_available integer;
  v_event_avail integer;
begin
  select * into v_inviter from public.inviters where id = p_inviter_id for update;
  if not found then
    raise exception 'INVITER_NOT_FOUND';
  end if;

  if not (v_inviter.profile_id = auth.uid()
          or public.owns_event(v_inviter.event_id)
          or public.is_admin()
          or auth.uid() is null) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_event from public.events where id = v_inviter.event_id for update;

  if v_event.status::text <> 'active' then
    return query select gid, false, 'EVENT_NOT_ACTIVE'::text, 0 from unnest(p_guest_ids) as gid;
    return;
  end if;

  -- المتاح داخل حصة الداعي
  select v_inviter.seats_quota
         - coalesce((select sum(max_seats) from public.guests
                     where inviter_id = p_inviter_id and status = 'sent'), 0)
         - coalesce((select sum(coalesce(confirmed_seats, 0)) from public.guests
                     where inviter_id = p_inviter_id and status in ('accepted','attended')), 0)
    into v_available;

  -- والمتاح في المناسبة كلها (سقف أعلى لا يُتجاوز)
  select v_event.seats_quota
         - coalesce((select sum(max_seats) from public.guests
                     where event_id = v_event.id and status = 'sent'), 0)
         - coalesce((select sum(coalesce(confirmed_seats, 0)) from public.guests
                     where event_id = v_event.id and status in ('accepted','attended')), 0)
    into v_event_avail;

  foreach guest_id in array p_guest_ids loop
    select * into v_guest from public.guests
     where id = guest_id and inviter_id = p_inviter_id;

    if not found then
      ok := false; reason := 'GUEST_NOT_FOUND'; missing_seats := 0;
      return next; continue;
    end if;

    if v_guest.status::text <> 'draft' then
      ok := false; reason := 'ALREADY_SENT'; missing_seats := 0;
      return next; continue;
    end if;

    if v_guest.max_seats > v_available then
      ok := false; reason := 'INSUFFICIENT_QUOTA';
      missing_seats := v_guest.max_seats - greatest(v_available, 0);
      return next; continue;
    end if;

    if v_guest.max_seats > v_event_avail then
      ok := false; reason := 'INSUFFICIENT_EVENT_SEATS';
      missing_seats := v_guest.max_seats - greatest(v_event_avail, 0);
      return next; continue;
    end if;

    update public.guests set status = 'sent', sent_at = now() where id = v_guest.id;

    v_available   := v_available - v_guest.max_seats;
    v_event_avail := v_event_avail - v_guest.max_seats;
    ok := true; reason := 'RESERVED'; missing_seats := 0;
    return next;
  end loop;
end;
$$;

revoke all on function public.inviter_balance(uuid) from public, anon;
revoke all on function public.reserve_seats_for_inviter(uuid, uuid[]) from public, anon;
grant execute on function public.inviter_balance(uuid) to authenticated, service_role;
grant execute on function public.reserve_seats_for_inviter(uuid, uuid[]) to authenticated, service_role;

/** تحرير حجز مدعو للداعي عند فشل الإرسال. */
create or replace function public.release_inviter_hold(p_guest_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_guest public.guests%rowtype;
begin
  select * into v_guest from public.guests where id = p_guest_id;
  if not found then return; end if;

  if v_guest.inviter_id is not null
     and (v_guest.inviter_id = public.my_inviter_id(v_guest.event_id)
          or public.owns_event(v_guest.event_id)
          or public.is_admin()
          or auth.uid() is null) then
    update public.guests set status = 'draft', sent_at = null
     where id = p_guest_id and status::text = 'sent';
  end if;
end;
$$;

revoke all on function public.release_inviter_hold(uuid) from public, anon;
grant execute on function public.release_inviter_hold(uuid) to authenticated, service_role;


-- ============================================================
-- تم. الخطوة التالية:
--   ١) أنشئ مستخدماً من Authentication ← Add user
--   ٢) اجعله أدمن:
--        update public.profiles p set role = 'admin'
--        from auth.users u
--        where u.id = p.id and u.email = 'البريد-هنا';
--   ٣) (اختياري) شغّل supabase/seed.sql للبيانات التجريبية
-- ============================================================
