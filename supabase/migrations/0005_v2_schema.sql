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
