-- ============================================================
-- 0019 — webhook واتساب: عدم التكرار (المرحلة ٨)
--
-- Meta تعيد إرسال الأحداث. قبل معالجة أي رسالة يُدرج معرّفها هنا
-- (insert … on conflict do nothing)؛ إن لم يُدرج صف → تُتخطّى.
-- للحالات (statuses) المفتاح wamid:status.
-- ============================================================

create table if not exists public.webhook_events (
  wamid        text primary key,
  received_at  timestamptz not null default now()
);

-- الجدول للخادم فقط (service role) — لا قراءة ولا كتابة من الويب
alter table public.webhook_events enable row level security;

drop policy if exists webhook_events_no_access on public.webhook_events;
create policy webhook_events_no_access on public.webhook_events
  for all to anon, authenticated using (false) with check (false);

-- تنظيف دوري اختياري: الأحداث الأقدم من ٣٠ يوماً لا تعود Meta إليها
create index if not exists webhook_events_received_idx on public.webhook_events (received_at);
