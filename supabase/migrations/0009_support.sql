-- ============================================================
-- برقية v2 — تذاكر الدعم (SPEC §8.3)
-- ============================================================

do $$ begin
  create type ticket_priority as enum ('low', 'normal', 'high', 'urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');
exception when duplicate_object then null; end $$;

create table if not exists public.support_tickets (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.profiles(id) on delete cascade,
  event_id     uuid references public.events(id) on delete set null,
  subject      text not null,
  body         text not null default '',
  priority     ticket_priority not null default 'normal',
  status       ticket_status not null default 'open',
  assigned_to  uuid references public.profiles(id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists tickets_status_idx on public.support_tickets(status, created_at);
create index if not exists tickets_client_idx on public.support_tickets(client_id);

alter table public.support_tickets enable row level security;

-- العميل يفتح تذاكره ويراها، والفريق يرى الكل ويعالجها
drop policy if exists tickets_client on public.support_tickets;
create policy tickets_client on public.support_tickets for select to authenticated
  using (client_id = auth.uid() or public.is_admin());

drop policy if exists tickets_client_insert on public.support_tickets;
create policy tickets_client_insert on public.support_tickets for insert to authenticated
  with check (client_id = auth.uid());

drop policy if exists tickets_admin_write on public.support_tickets;
create policy tickets_admin_write on public.support_tickets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

/**
 * إحصاءات مجمّعة بلا هوية — شاشة «الرؤى» (SPEC §7).
 * لا تُرجع أي رقم جوال ولا اسم مدعو، أرقاماً مجمّعة فقط.
 */
create or replace function public.platform_insights()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'events_total',        (select count(*) from public.events),
    'events_active',       (select count(*) from public.events where status::text = 'active'),
    'clients_total',       (select count(*) from public.profiles where role::text in ('user','owner')),
    'guests_total',        (select count(*) from public.guests),
    'messages_sent',       (select count(*) from public.guests where status::text <> 'draft'),
    'accepted_total',      (select count(*) from public.guests where status::text in ('accepted','attended')),
    'declined_total',      (select count(*) from public.guests where status::text = 'declined'),
    'attended_total',      (select count(*) from public.guests where status::text = 'attended'),
    'seats_confirmed',     (select coalesce(sum(confirmed_seats),0) from public.guests
                             where status::text in ('accepted','attended')),
    'avg_seats_per_invite',(select round(avg(max_seats)::numeric, 1) from public.guests),
    'occasions',           (select jsonb_object_agg(occasion_type, c) from (
                              select occasion_type::text as occasion_type, count(*) c
                              from public.events group by 1) t),
    'revenue_total',       (select coalesce(sum(amount),0) from public.transactions
                             where status::text = 'paid')
  )
  where public.is_admin();
$$;

revoke all on function public.platform_insights() from public, anon;
grant execute on function public.platform_insights() to authenticated, service_role;
