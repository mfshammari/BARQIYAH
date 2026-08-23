-- ============================================================
-- برقية v2 — الدفع والتفعيل التلقائي (SPEC §5)
--
-- «التفعيل يعتمد على Webhook من بوابة الدفع لا على رجوع المستخدم
-- للصفحة — لأن المستخدم قد يغلق المتصفح بعد الدفع.»
-- والعملية idempotent لأن البوابات تعيد إرسال الـwebhook.
-- ============================================================

/**
 * إنشاء عملية دفع معلّقة قبل تحويل العميل للبوابة.
 * تُرجع معرّف العملية ليُمرَّر للبوابة ويعود في الـwebhook.
 */
create or replace function public.create_pending_payment(
  p_event_id uuid,
  p_package_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_pkg public.packages%rowtype;
  v_tx  uuid;
begin
  if not (public.owns_event(p_event_id) or public.is_admin() or auth.uid() is null) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_pkg from public.packages where id = p_package_id and active;
  if not found then
    raise exception 'PACKAGE_NOT_FOUND';
  end if;

  insert into public.transactions
    (event_id, package_id, amount, type, status, method, seats_added, note)
  values
    (p_event_id, p_package_id, v_pkg.price, 'purchase', 'pending', 'gateway', v_pkg.seats,
     'بانتظار السداد عبر البوابة')
  returning id into v_tx;

  return v_tx;
end;
$$;

/**
 * تفعيل المناسبة بعد تأكيد السداد — يُستدعى من الـwebhook فقط.
 *
 * idempotent: يُميّز العملية بـ gateway_ref الفريد، فإعادة إرسال
 * الـwebhook لا تضيف المقاعد مرتين. يُسجّل في activity_logs بمنفّذ
 * فارغ (النظام) تمييزاً له عن التفعيل اليدوي.
 */
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
  v_pkg   public.packages%rowtype;
  v_event public.events%rowtype;
  v_seats integer;
begin
  -- قفل العملية: نداءان متزامنان من البوابة لا يفعّلان مرتين
  select * into v_tx from public.transactions where id = p_transaction_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'TRANSACTION_NOT_FOUND');
  end if;

  -- سُدّدت من قبل: نرجع النجاح دون تكرار الإضافة
  if v_tx.status::text = 'paid' then
    return jsonb_build_object('ok', true, 'reason', 'ALREADY_PAID', 'idempotent', true);
  end if;

  select * into v_pkg   from public.packages where id = v_tx.package_id;
  select * into v_event from public.events   where id = v_tx.event_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'EVENT_NOT_FOUND');
  end if;

  v_seats := v_event.seats_quota + coalesce(v_pkg.seats, v_tx.seats_added, 0);

  update public.transactions
     set status = 'paid', gateway_ref = p_gateway_ref, paid_at = now(),
         amount = coalesce(p_amount, amount)
   where id = p_transaction_id;

  update public.events
     set status = 'active',
         seats_quota = v_seats,
         package_id = coalesce(package_id, v_tx.package_id),
         activated_at = now(),
         activated_by = null          -- النظام: تفعيل تلقائي بعد السداد
   where id = v_tx.event_id;

  insert into public.activity_logs (actor_id, action, target_type, target_id, metadata)
  values (null, 'event.activated_by_payment', 'event', v_tx.event_id,
          jsonb_build_object('transaction_id', p_transaction_id,
                             'gateway_ref', p_gateway_ref,
                             'seats_quota', v_seats));

  return jsonb_build_object('ok', true, 'seats_quota', v_seats, 'event_id', v_tx.event_id);
end;
$$;

/** تعليم العملية فاشلة (webhook فشل السداد). */
create or replace function public.fail_payment(p_transaction_id uuid, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.transactions
     set status = 'failed', note = coalesce(p_reason, note)
   where id = p_transaction_id and status::text = 'pending';

  insert into public.activity_logs (actor_id, action, target_type, target_id, metadata)
  select null, 'payment.failed', 'transaction', p_transaction_id,
         jsonb_build_object('reason', p_reason);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.create_pending_payment(uuid, uuid) from public, anon;
revoke all on function public.activate_event_from_payment(uuid, text, numeric) from public, anon;
revoke all on function public.fail_payment(uuid, text) from public, anon;

grant execute on function public.create_pending_payment(uuid, uuid) to authenticated, service_role;
-- التفعيل من الـwebhook على الخادم فقط
grant execute on function public.activate_event_from_payment(uuid, text, numeric) to service_role;
grant execute on function public.fail_payment(uuid, text) to service_role;
