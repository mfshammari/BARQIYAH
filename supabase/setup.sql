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


-- ============================================================
-- تم. الخطوة التالية:
--   ١) أنشئ مستخدماً من Authentication ← Add user
--   ٢) اجعله أدمن:
--        update public.profiles p set role = 'admin'
--        from auth.users u
--        where u.id = p.id and u.email = 'البريد-هنا';
--   ٣) (اختياري) شغّل supabase/seed.sql للبيانات التجريبية
-- ============================================================
