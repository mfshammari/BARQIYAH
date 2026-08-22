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
