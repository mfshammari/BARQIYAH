-- ============================================================
-- 0014 — الباقات تنعكس من الأدمن: قراءة عامة، باقة مخصّصة بشرائح،
--        وتجميد السعر والمقاعد لحظة الشراء
--
-- مصدر الباقات الوحيد جدول packages. الصفحة الرئيسية تقرأها للزائر غير
-- المسجّل (anon). ٣ باقات ثابتة + باقة رابعة مخصّصة بتسعير متدرّج
-- تراكمي يضبطه الأدمن. سعر الباقة يتجمّد في صفّ transactions لحظة
-- الشراء، والتفعيل يضيف seats_added من الصفّ لا من الباقة.
-- ============================================================

-- ---------- ١) قراءة الباقات النشطة للجميع ----------
drop policy if exists packages_read on public.packages;
drop policy if exists packages_read_public on public.packages;
create policy packages_read_public on public.packages for select to anon, authenticated
  using (active or public.is_admin());

-- ---------- ٢) حقول العرض والنوع ----------
alter table public.packages
  add column if not exists kind         text not null default 'fixed',
  add column if not exists description  text,
  add column if not exists features     text[] not null default '{}',
  add column if not exists is_featured  boolean not null default false,
  add column if not exists sort_order   integer not null default 0,
  add column if not exists min_qty      integer,            -- للمخصّصة: أقل كمية
  add column if not exists updated_at   timestamptz not null default now();

do $$ begin
  alter table public.packages
    add constraint packages_kind_check check (kind in ('fixed', 'custom'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.packages
    add constraint packages_custom_min_qty_check
    check (kind <> 'custom' or (min_qty is not null and min_qty > 0));
exception when duplicate_object then null; end $$;

-- باقة مخصّصة واحدة فقط، وباقة مميّزة واحدة فقط
create unique index if not exists packages_single_custom
  on public.packages(kind) where kind = 'custom';
create unique index if not exists packages_single_featured
  on public.packages(is_featured) where is_featured;

-- الكمية التي اختارها العميل للباقة المخصّصة عند إنشاء المناسبة (تُدفع لاحقاً)
alter table public.events
  add column if not exists package_qty integer check (package_qty is null or package_qty > 0);

-- ---------- ٣) شرائح الباقة المخصّصة (يدخلها الأدمن) ----------
create table if not exists public.package_tiers (
  id          uuid primary key default gen_random_uuid(),
  package_id  uuid not null references public.packages(id) on delete cascade,
  min_qty     integer not null check (min_qty > 0),
  unit_price  numeric(10,2) not null check (unit_price > 0),
  unique (package_id, min_qty)
);
create index if not exists package_tiers_package_idx on public.package_tiers(package_id, min_qty);

alter table public.package_tiers enable row level security;

drop policy if exists tiers_read_public on public.package_tiers;
create policy tiers_read_public on public.package_tiers for select to anon, authenticated using (true);

drop policy if exists tiers_admin_write on public.package_tiers;
create policy tiers_admin_write on public.package_tiers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- ٤) التحقق من الشرائح ----------
-- مرتّبة تصاعدياً بالكمية وتنازلياً بالسعر، وأول شريحة = min_qty الباقة،
-- وإلا TIERS_INVALID. القيد في القاعدة لا في الواجهة وحدها.
create or replace function public.check_package_tiers(p_package_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_min   integer;
  v_first integer;
  v_bad   integer;
begin
  select min_qty into v_first
  from public.package_tiers where package_id = p_package_id
  order by min_qty limit 1;

  if v_first is null then
    return;   -- بلا شرائح: لا شيء يُتحقّق منه
  end if;

  select min_qty into v_min from public.packages where id = p_package_id;
  if v_min is null or v_first <> v_min then
    raise exception 'TIERS_INVALID'
      using hint = 'أول شريحة يجب أن تبدأ من أقل كمية للباقة.';
  end if;

  select count(*) into v_bad
  from (
    select unit_price, lag(unit_price) over (order by min_qty) as prev
    from public.package_tiers where package_id = p_package_id
  ) s
  where prev is not null and unit_price >= prev;

  if v_bad > 0 then
    raise exception 'TIERS_INVALID'
      using hint = 'سعر الدعوة يجب أن ينخفض مع زيادة الكمية.';
  end if;
end;
$$;

create or replace function public.trg_check_package_tiers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  for r in select distinct package_id from public.package_tiers loop
    perform public.check_package_tiers(r.package_id);
  end loop;
  return null;
end;
$$;

drop trigger if exists package_tiers_validate on public.package_tiers;
create trigger package_tiers_validate
  after insert or update or delete on public.package_tiers
  for each statement execute function public.trg_check_package_tiers();

-- تعديل min_qty بعد وجود شرائح يُعاد التحقق منه (بعد الكتابة كي تُقرأ القيمة الجديدة)
create or replace function public.trg_check_package_min_qty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_package_tiers(new.id);
  return null;
end;
$$;

drop trigger if exists packages_validate_min_qty on public.packages;
create trigger packages_validate_min_qty
  after update of min_qty on public.packages
  for each row execute function public.trg_check_package_min_qty();

create or replace function public.trg_touch_package()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists packages_touch on public.packages;
create trigger packages_touch
  before update on public.packages
  for each row execute function public.trg_touch_package();

-- ---------- ٥) استبدال شرائح الباقة دفعةً واحدة (الأدمن) ----------
-- p_tiers: [{"min_qty":1000,"unit_price":1.5}, …]
create or replace function public.set_package_tiers(
  p_package_id uuid,
  p_min_qty    integer,
  p_tiers      jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or auth.uid() is null) then
    raise exception 'FORBIDDEN';
  end if;

  delete from public.package_tiers where package_id = p_package_id;

  update public.packages set min_qty = p_min_qty where id = p_package_id;

  insert into public.package_tiers (package_id, min_qty, unit_price)
  select p_package_id, (t ->> 'min_qty')::integer, (t ->> 'unit_price')::numeric
  from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) as t;
end;
$$;

-- ---------- ٦) تسعير الكمية المخصّصة: تدرّج تراكمي ----------
-- كل شريحة تسعّر ما يقع داخلها: الأولى من ١ إلى ما قبل الثانية، وهكذا.
-- الحساب تراكمي حتى لا تنخفض الفاتورة بزيادة الكمية (قرار جلسة الباقات).
create or replace function public.custom_package_price(p_qty integer)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with t as (
    select pt.min_qty,
           pt.unit_price,
           lead(pt.min_qty) over (order by pt.min_qty) as next_min,
           row_number()     over (order by pt.min_qty) as rn
    from public.package_tiers pt
    join public.packages p on p.id = pt.package_id and p.kind = 'custom'
  )
  select case
    when p_qty is null or p_qty <= 0 then 0::numeric
    else coalesce((
      select sum(
        unit_price * greatest(
          0,
          least(p_qty, coalesce(next_min - 1, p_qty))
            - (case when rn = 1 then 1 else min_qty end) + 1
        )
      ) from t
    ), 0::numeric)
  end;
$$;

-- ---------- ٧) تجميد السعر والمقاعد لحظة الشراء ----------
drop function if exists public.create_pending_payment(uuid, uuid);

create or replace function public.create_pending_payment(
  p_event_id   uuid,
  p_package_id uuid,
  p_qty        integer default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_pkg    public.packages%rowtype;
  v_event  public.events%rowtype;
  v_tx     uuid;
  v_amount numeric;
  v_seats  integer;
  v_type   text;
begin
  if not (public.owns_event(p_event_id) or public.is_admin() or auth.uid() is null) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  select * into v_pkg from public.packages where id = p_package_id and active;
  if not found then
    raise exception 'PACKAGE_NOT_FOUND';
  end if;

  -- الإضافة على مناسبة قائمة (لها رصيد) ترقية، وإلا شراء أول
  v_type := case when v_event.seats_quota > 0 then 'upgrade' else 'purchase' end;

  if v_pkg.kind = 'custom' then
    if p_qty is null or p_qty < 1 then
      raise exception 'QTY_REQUIRED';
    end if;
    if v_type = 'purchase' and p_qty < coalesce(v_pkg.min_qty, 1) then
      raise exception 'QTY_BELOW_MIN'
        using hint = format('أقل كمية للباقة المخصّصة %s دعوة.', v_pkg.min_qty);
    end if;
    -- الترقية تُسعَّر بالشرائح الحيّة على الإجمالي التراكمي
    if v_type = 'upgrade' then
      v_amount := public.custom_package_price(v_event.seats_quota + p_qty)
                - public.custom_package_price(v_event.seats_quota);
    else
      v_amount := public.custom_package_price(p_qty);
    end if;
    v_seats := p_qty;
  else
    v_amount := v_pkg.price;
    v_seats  := v_pkg.seats;
  end if;

  insert into public.transactions
    (event_id, package_id, amount, type, status, method, seats_added, note)
  values
    (p_event_id, p_package_id, v_amount, v_type::transaction_type, 'pending', 'gateway', v_seats,
     'بانتظار السداد عبر البوابة')
  returning id into v_tx;

  return v_tx;
end;
$$;

-- التفعيل بعد السداد: يضيف seats_added من صفّ العملية — لا يعيد قراءة الباقة
create or replace function public.activate_event_from_payment(
  p_transaction_id uuid,
  p_gateway_ref text,
  p_amount numeric default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tx    public.transactions%rowtype;
  v_event public.events%rowtype;
  v_seats integer;
begin
  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'TRANSACTION_NOT_FOUND');
  end if;

  if v_tx.status::text = 'paid' then
    return jsonb_build_object('ok', true, 'reason', 'ALREADY_PAID', 'idempotent', true);
  end if;

  select * into v_event from public.events where id = v_tx.event_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'EVENT_NOT_FOUND');
  end if;

  -- المقاعد المجمّدة لحظة الشراء — تعديل الباقة لاحقاً لا يغيّرها
  v_seats := v_event.seats_quota + coalesce(v_tx.seats_added, 0);

  update public.transactions
     set status = 'paid', gateway_ref = p_gateway_ref, paid_at = now(),
         amount = coalesce(p_amount, amount)
   where id = p_transaction_id;

  update public.events
     set status = 'active',
         seats_quota = v_seats,
         package_id = coalesce(package_id, v_tx.package_id),
         activated_at = now(),
         activated_by = null
   where id = v_tx.event_id;

  insert into public.activity_logs (actor_id, action, target_type, target_id, metadata)
  values (null, 'event.activated_by_payment', 'event', v_tx.event_id,
          jsonb_build_object('transaction_id', p_transaction_id,
                             'gateway_ref', p_gateway_ref,
                             'seats_quota', v_seats));

  return jsonb_build_object('ok', true, 'seats_quota', v_seats, 'event_id', v_tx.event_id);
end;
$$;

-- التفعيل اليدوي: يسعّر ويجمّد لحظة التنفيذ، ويدعم الكمية المخصّصة
drop function if exists public.admin_activate_event(uuid, uuid, transaction_type, text);

create or replace function public.admin_activate_event(
  p_event_id   uuid,
  p_package_id uuid,
  p_type       transaction_type default 'manual_activation',
  p_note       text default null,
  p_qty        integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_pkg    public.packages%rowtype;
  v_event  public.events%rowtype;
  v_added  integer;
  v_amount numeric;
  v_seats  integer;
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

  if v_pkg.kind = 'custom' then
    if p_qty is null or p_qty < 1 then
      return jsonb_build_object('ok', false, 'reason', 'QTY_REQUIRED');
    end if;
    v_added := p_qty;
    if p_type = 'upgrade' then
      v_amount := public.custom_package_price(v_event.seats_quota + p_qty)
                - public.custom_package_price(v_event.seats_quota);
    else
      v_amount := public.custom_package_price(p_qty);
    end if;
  else
    v_added  := v_pkg.seats;
    v_amount := v_pkg.price;
  end if;

  -- التفعيل الأول يضبط الرصيد، والترقية تضيف فوقه
  if p_type = 'upgrade' then
    v_seats := v_event.seats_quota + v_added;
  else
    v_seats := greatest(v_event.seats_quota, v_added);
  end if;

  update public.events
     set status       = 'active',
         seats_quota  = v_seats,
         package_id   = case when p_type = 'upgrade' then package_id else p_package_id end,
         activated_at = coalesce(activated_at, now()),
         activated_by = coalesce(activated_by, auth.uid())
   where id = p_event_id;

  insert into public.transactions (event_id, package_id, amount, type, status, seats_added, note)
  values (p_event_id, p_package_id, v_amount, p_type, 'paid', v_added, p_note);

  return jsonb_build_object('ok', true, 'seats_quota', v_seats);
end;
$$;

-- ---------- ٨) الصلاحيات ----------
revoke all on function public.custom_package_price(integer) from public;
grant execute on function public.custom_package_price(integer) to anon, authenticated, service_role;

revoke all on function public.check_package_tiers(uuid) from public, anon;
grant execute on function public.check_package_tiers(uuid) to authenticated, service_role;

revoke all on function public.set_package_tiers(uuid, integer, jsonb) from public, anon;
grant execute on function public.set_package_tiers(uuid, integer, jsonb) to authenticated, service_role;

revoke all on function public.create_pending_payment(uuid, uuid, integer) from public, anon;
grant execute on function public.create_pending_payment(uuid, uuid, integer) to authenticated, service_role;

revoke all on function public.activate_event_from_payment(uuid, text, numeric) from public, anon;
grant execute on function public.activate_event_from_payment(uuid, text, numeric) to service_role;

revoke all on function public.admin_activate_event(uuid, uuid, transaction_type, text, integer) from public, anon;
grant execute on function public.admin_activate_event(uuid, uuid, transaction_type, text, integer) to authenticated, service_role;
