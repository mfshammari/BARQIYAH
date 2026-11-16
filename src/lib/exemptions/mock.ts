/**
 * محاكاة طبقة البيانات للإعفاء — بيانات في الذاكرة بتأخير ٣٠٠ مللي ثانية،
 * تُحفظ في localStorage في المتصفح ليشترك تبويب الأدمن وتبويب العميل.
 *
 * «الخادم» هنا هو هذا الملف: التحقق من صفة المنفّذ (setActor يحاكي الجلسة)
 * ومن السقف يجري داخل الدوال لا في الواجهة. عند ربط Supabase تُستبدل
 * الأجسام بـRPC تُطبّق القواعد نفسها.
 */
import {
  decideSend, exemptionStatus, isExemptionActive, isExpired, isSuperAdmin,
  validateGrantInput, validateNewCap,
} from './logic';
import type {
  Actor, CanSendResult, Exemption, ExemptionAction, ExemptionLogEntry, GrantInput,
} from './types';

export const MOCK_DELAY_MS = 300;
const STORAGE_KEY = 'barqiyah.exemptions.v1';

export interface MockAccount {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
}

export interface MockEvent {
  id: string;
  accountId: string;
  name: string;
  status: 'unpaid' | 'active';
  /** باقة مدفوعة (لا إعفاء) */
  paidPackage: string | null;
  sent: number;
  createdAt: string;
}

interface Store {
  accounts: MockAccount[];
  events: MockEvent[];
  exemptions: Record<string, Exemption>;
  log: ExemptionLogEntry[];
  seq: number;
}

/* ———————— الأدمن (جلسات محاكاة) ———————— */

export const ADMINS: Actor[] = [
  { id: 'adm_owner', name: 'مدير المنصة', role: 'admin_owner' },
  { id: 'adm_support', name: 'دعم برقية', role: 'admin_support' },
];

export function adminName(id: string): string {
  return ADMINS.find((a) => a.id === id)?.name ?? id;
}

const SEED_ACCOUNTS: MockAccount[] = [
  { id: 'acc_1', name: 'عبدالله بن سعد العتيبي', phone: '+966555200001', createdAt: '2026-09-02T10:00:00.000Z' },
  { id: 'acc_2', name: 'نورة القحطاني', phone: '+966555200002', createdAt: '2026-09-18T08:30:00.000Z' },
  { id: 'acc_3', name: 'روائع للمناسبات', phone: '+966555200003', createdAt: '2026-10-05T14:15:00.000Z' },
  { id: 'acc_4', name: 'محمد الشهري', phone: '+966555200004', createdAt: '2026-10-29T19:45:00.000Z' },
];

function seed(): Store {
  const grantedAt = '2026-10-06T09:00:00.000Z';
  return {
    accounts: SEED_ACCOUNTS.map((a) => ({ ...a })),
    events: [
      { id: 'ev_1', accountId: 'acc_1', name: 'حفل زواج فيصل', status: 'active', paidPackage: 'الباقة الذهبية', sent: 120, createdAt: '2026-09-03T10:00:00.000Z' },
      { id: 'ev_2', accountId: 'acc_3', name: 'حفل تخرّج دفعة ٤٧', status: 'active', paidPackage: null, sent: 6, createdAt: '2026-10-07T11:00:00.000Z' },
      { id: 'ev_3', accountId: 'acc_2', name: 'حفل زواج ريم', status: 'unpaid', paidPackage: null, sent: 0, createdAt: '2026-11-01T16:00:00.000Z' },
    ],
    exemptions: {
      acc_3: {
        accountId: 'acc_3', cap: 20, used: 6, reason: 'partner', note: 'شريك تنظيم مناسبات',
        expiresAt: null, grantedBy: 'adm_owner', grantedAt, revokedAt: null,
      },
    },
    log: [
      { id: 'log_1', accountId: 'acc_3', action: 'grant', cap: 20, reason: 'partner', adminId: 'adm_owner', at: grantedAt },
    ],
    seq: 10,
  };
}

let memory: Store | null = null;
let actor: Actor = ADMINS[0];

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function load(): Store {
  if (memory) return memory;
  const s = storage();
  if (s) {
    try {
      const raw = s.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Store;
        if (parsed?.accounts && parsed.exemptions && Array.isArray(parsed.log)) {
          memory = parsed;
          return memory;
        }
      }
    } catch { /* تخزين معطوب → نبدأ من جديد */ }
  }
  memory = seed();
  persist();
  return memory;
}

function persist() {
  const s = storage();
  if (!s || !memory) return;
  try { s.setItem(STORAGE_KEY, JSON.stringify(memory)); } catch { /* ممتلئ أو محجوب */ }
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), MOCK_DELAY_MS));
}

function nextId(prefix: string): string {
  const store = load();
  store.seq += 1;
  return `${prefix}_${store.seq}`;
}

function appendLog(ex: Exemption, action: ExemptionAction, adminId: string) {
  load().log.push({
    id: nextId('log'),
    accountId: ex.accountId,
    action,
    cap: ex.cap,
    reason: ex.reason,
    adminId,
    at: new Date().toISOString(),
  });
}

/** انتهاء كسول: أول قراءة بعد تاريخ الانتهاء تُسجّل «انتهاء» مرة واحدة. */
function touchExpiry(ex: Exemption) {
  if (ex.revokedAt || !isExpired(ex)) return;
  const store = load();
  const logged = store.log.some(
    (l) => l.accountId === ex.accountId && l.action === 'expire' && l.at >= ex.grantedAt,
  );
  if (!logged) {
    appendLog(ex, 'expire', 'system');
    persist();
  }
}

/* ———————— الجلسة (محاكاة) ———————— */

/** يحاكي جلسة الخادم: من ينفّذ الطلب. في الإنتاج يُقرأ من Supabase auth. */
export function setActor(a: Actor) { actor = a; }
export function getActor(): Actor { return actor; }

function requireSuperAdmin(): Actor {
  if (!isSuperAdmin(actor.role)) {
    throw new Error('غير مصرّح: الإعفاء من الدفع يمنحه ويسحبه سوبر أدمن فقط');
  }
  return actor;
}

function requireAccount(accountId: string): MockAccount {
  const a = load().accounts.find((x) => x.id === accountId);
  if (!a) throw new Error('الحساب غير موجود');
  return a;
}

/* ———————— واجهة الأدمن ———————— */

export async function grantExemption(accountId: string, input: GrantInput): Promise<Exemption> {
  const admin = requireSuperAdmin();
  requireAccount(accountId);
  const err = validateGrantInput(input);
  if (err) throw new Error(err);
  const store = load();
  const prev = store.exemptions[accountId];
  if (prev && isExemptionActive(prev)) throw new Error('الحساب معفى بالفعل — عدّل السقف بدل منح إعفاء جديد');
  const ex: Exemption = {
    accountId,
    cap: input.cap,
    used: 0,
    reason: input.reason,
    note: input.note?.trim() || null,
    expiresAt: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
    grantedBy: admin.id,
    grantedAt: new Date().toISOString(),
    revokedAt: null,
  };
  store.exemptions[accountId] = ex;
  appendLog(ex, 'grant', admin.id);
  persist();
  return delay({ ...ex });
}

export async function updateExemptionCap(accountId: string, cap: number): Promise<Exemption> {
  const admin = requireSuperAdmin();
  const ex = load().exemptions[accountId];
  if (!ex) throw new Error('لا إعفاء لهذا الحساب');
  if (ex.revokedAt) throw new Error('الإعفاء مسحوب — امنح إعفاءً جديدًا');
  const err = validateNewCap(ex, cap);
  if (err) throw new Error(err);
  ex.cap = cap;
  appendLog(ex, 'update', admin.id);
  persist();
  return delay({ ...ex });
}

export async function revokeExemption(accountId: string): Promise<Exemption> {
  const admin = requireSuperAdmin();
  const ex = load().exemptions[accountId];
  if (!ex) throw new Error('لا إعفاء لهذا الحساب');
  if (ex.revokedAt) throw new Error('الإعفاء مسحوب مسبقًا');
  ex.revokedAt = new Date().toISOString();
  appendLog(ex, 'revoke', admin.id);
  persist();
  return delay({ ...ex });
}

export async function getExemption(accountId: string): Promise<Exemption | null> {
  const ex = load().exemptions[accountId] ?? null;
  if (ex) touchExpiry(ex);
  return delay(ex ? { ...ex } : null);
}

/** سجل لا يُحذف منه شيء — الأحدث أولاً */
export async function listExemptionLog(accountId?: string): Promise<ExemptionLogEntry[]> {
  const store = load();
  Object.values(store.exemptions).forEach(touchExpiry);
  const rows = store.log
    .filter((l) => !accountId || l.accountId === accountId)
    .slice()
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return delay(rows.map((r) => ({ ...r })));
}

/* ———————— فحص الخادم قبل الإرسال ———————— */

export async function canSend(accountId: string, eventId: string, count: number): Promise<CanSendResult> {
  const store = load();
  const ev = store.events.find((e) => e.id === eventId && e.accountId === accountId);
  if (!ev) return delay({ ok: false, reason: 'no_package' as const });
  const ex = store.exemptions[accountId] ?? null;
  if (ex) touchExpiry(ex);
  return delay(decideSend(ex, count, Boolean(ev.paidPackage) && ev.status === 'active'));
}

/* ———————— جانب العميل (محاكاة المناسبات والإرسال) ———————— */

export async function listAccounts(): Promise<MockAccount[]> {
  return delay(load().accounts.map((a) => ({ ...a })));
}

export async function listAllExemptions(): Promise<Record<string, Exemption>> {
  const store = load();
  Object.values(store.exemptions).forEach(touchExpiry);
  const out: Record<string, Exemption> = {};
  for (const [k, v] of Object.entries(store.exemptions)) out[k] = { ...v };
  return delay(out);
}

export async function listEvents(accountId?: string): Promise<MockEvent[]> {
  return delay(load().events.filter((e) => !accountId || e.accountId === accountId).map((e) => ({ ...e })));
}

/**
 * إنشاء مناسبة: الحساب المعفى (إعفاء نشط) تُفعَّل مناسبته فورًا بلا خطوة دفع؛
 * غيره تبقى «غير مدفوعة» حتى اختيار باقة.
 */
export async function createEvent(accountId: string, name: string): Promise<MockEvent> {
  requireAccount(accountId);
  const store = load();
  const ex = store.exemptions[accountId] ?? null;
  const ev: MockEvent = {
    id: nextId('ev'),
    accountId,
    name: name.trim() || 'مناسبة جديدة',
    status: isExemptionActive(ex) ? 'active' : 'unpaid',
    paidPackage: null,
    sent: 0,
    createdAt: new Date().toISOString(),
  };
  store.events.push(ev);
  persist();
  return delay({ ...ev });
}

/** الإرسال: يفحص على «الخادم» ثم يخصم من سقف الإعفاء إن كان هو المصدر. */
export async function sendInvitations(
  accountId: string,
  eventId: string,
  count: number,
): Promise<{ result: CanSendResult; event: MockEvent | null; exemption: Exemption | null }> {
  const store = load();
  const ev = store.events.find((e) => e.id === eventId && e.accountId === accountId) ?? null;
  const ex = store.exemptions[accountId] ?? null;
  if (ex) touchExpiry(ex);
  const paid = Boolean(ev?.paidPackage) && ev?.status === 'active';
  const result = ev ? decideSend(ex, count, paid) : { ok: false, reason: 'no_package' as const };
  if (result.ok && ev) {
    ev.sent += count;
    if (!paid && ex) {
      ex.used += count;
      // إعفاء نشط يفعّل مناسبة قديمة غير مدفوعة عند أول إرسال منها
      ev.status = 'active';
    }
    persist();
  }
  return delay({ result, event: ev ? { ...ev } : null, exemption: ex ? { ...ex } : null });
}

/* ———————— أدوات تطوير واختبار ———————— */

export async function resetMock(): Promise<void> {
  memory = seed();
  persist();
  return delay(undefined);
}

/** للاختبارات فقط: تقديم تاريخ الانتهاء إلى الماضي */
export function _debugExpire(accountId: string) {
  const ex = load().exemptions[accountId];
  if (ex) { ex.expiresAt = new Date(Date.now() - 1000).toISOString(); persist(); }
}

export function _debugStatus(accountId: string) {
  const ex = load().exemptions[accountId];
  return ex ? exemptionStatus(ex) : null;
}
