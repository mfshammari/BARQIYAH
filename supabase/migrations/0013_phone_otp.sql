-- ============================================================
-- 0013 — دخول العميل بالجوال عبر رمز تحقق (OTP)
--
-- العميل يدخل بجواله ورمز يصله على واتساب. الفريق يبقى على البريد
-- وكلمة المرور — مسار موثوق لا يعتمد على قناة خارجية قد تتعطّل.
--
-- ما يُخزَّن هنا هو **بصمة** الرمز لا نصّه، ومعه حدود المعدّل وعدّاد
-- المحاولات — لأن الحد في المتصفح ليس حداً.
-- ============================================================

-- pgcrypto لتوليد البصمات؛ في Supabase يسكن schema اسمه extensions
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.otp_requests (
  id            uuid primary key default gen_random_uuid(),
  phone         text not null,
  code_hash     text not null,
  purpose       text not null default 'login',
  attempts      integer not null default 0,
  consumed_at   timestamptz,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists otp_requests_phone_idx
  on public.otp_requests (phone, created_at desc);

-- الجدول لا يُقرأ ولا يُكتب من الويب إطلاقاً: كل التعامل عبر دوال
-- SECURITY DEFINER أدناه، ومفتاح الخدمة في الخادم.
alter table public.otp_requests enable row level security;

drop policy if exists otp_requests_no_access on public.otp_requests;
create policy otp_requests_no_access on public.otp_requests
  for all to anon, authenticated using (false) with check (false);

-- بصمة الرمز مملّحة بالجوال، فرمز واحد لجوالين بصمتان مختلفتان
create or replace function public.otp_hash(p_phone text, p_code text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(digest(p_phone || ':' || p_code, 'sha256'), 'hex');
$$;

-- ------------------------------------------------------------
-- طلب رمز: يفرض الحد (٣ طلبات لكل جوال في الساعة) ويخزّن البصمة.
-- يرجع ok=false مع RATE_LIMITED عند التجاوز — والحد في القاعدة
-- لا في المتصفح.
-- ------------------------------------------------------------
create or replace function public.request_otp(
  p_phone text,
  p_code  text,
  p_ttl_seconds integer default 300
)
returns table (ok boolean, reason text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_recent int;
  v_expires timestamptz;
begin
  if p_phone is null or length(trim(p_phone)) < 8 then
    return query select false, 'INVALID_PHONE'::text, null::timestamptz;
    return;
  end if;

  select count(*) into v_recent
  from public.otp_requests o
  where o.phone = p_phone
    and o.created_at > now() - interval '1 hour';

  if v_recent >= 3 then
    return query select false, 'RATE_LIMITED'::text, null::timestamptz;
    return;
  end if;

  -- الرموز السابقة لهذا الجوال تُستهلك فلا يصلح إلا الأحدث
  update public.otp_requests
  set consumed_at = now()
  where phone = p_phone and consumed_at is null;

  v_expires := now() + make_interval(secs => greatest(p_ttl_seconds, 60));

  insert into public.otp_requests (phone, code_hash, expires_at)
  values (p_phone, public.otp_hash(p_phone, p_code), v_expires);

  return query select true, null::text, v_expires;
end;
$$;

-- ------------------------------------------------------------
-- التحقق من الرمز: ينتهي بالصلاحية، ويقفل بعد ٥ محاولات خاطئة،
-- ويُستهلك عند النجاح فلا يصلح مرتين.
-- ------------------------------------------------------------
create or replace function public.verify_otp(
  p_phone text,
  p_code  text
)
returns table (ok boolean, reason text, attempts_left integer)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r public.otp_requests%rowtype;
begin
  select * into r
  from public.otp_requests o
  where o.phone = p_phone and o.consumed_at is null
  order by o.created_at desc
  limit 1
  for update;

  if r.id is null then
    return query select false, 'EXPIRED'::text, 0;
    return;
  end if;

  if r.expires_at <= now() then
    update public.otp_requests set consumed_at = now() where id = r.id;
    return query select false, 'EXPIRED'::text, 0;
    return;
  end if;

  if r.attempts >= 5 then
    update public.otp_requests set consumed_at = now() where id = r.id;
    return query select false, 'TOO_MANY_ATTEMPTS'::text, 0;
    return;
  end if;

  if r.code_hash = public.otp_hash(p_phone, p_code) then
    update public.otp_requests set consumed_at = now() where id = r.id;
    return query select true, null::text, 5 - r.attempts;
    return;
  end if;

  update public.otp_requests set attempts = attempts + 1 where id = r.id;

  if r.attempts + 1 >= 5 then
    update public.otp_requests set consumed_at = now() where id = r.id;
    return query select false, 'TOO_MANY_ATTEMPTS'::text, 0;
    return;
  end if;

  return query select false, 'INVALID_CODE'::text, 5 - (r.attempts + 1);
end;
$$;

-- ------------------------------------------------------------
-- رمز الاسترجاع: يُولَّد في الخادم وتُخزَّن بصمته وحدها.
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists recovery_hash text,
  add column if not exists recovery_set_at timestamptz;

comment on column public.profiles.recovery_hash is
  'بصمة رمز الاسترجاع — النص لا يُخزَّن ولا يُعرض إلا مرة واحدة عند الإنشاء.';

create or replace function public.set_recovery_code(
  p_user_id uuid,
  p_code    text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.profiles
  set recovery_hash   = encode(digest(p_user_id::text || ':' || p_code, 'sha256'), 'hex'),
      recovery_set_at = now()
  where id = p_user_id;
end;
$$;

revoke all on function public.request_otp(text, text, integer) from public, anon, authenticated;
revoke all on function public.verify_otp(text, text) from public, anon, authenticated;
revoke all on function public.set_recovery_code(uuid, text) from public, anon, authenticated;
grant execute on function public.request_otp(text, text, integer) to service_role;
grant execute on function public.verify_otp(text, text) to service_role;
grant execute on function public.set_recovery_code(uuid, text) to service_role;
