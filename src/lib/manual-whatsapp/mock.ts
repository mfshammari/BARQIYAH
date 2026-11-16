/**
 * محاكاة طبقة البيانات — بيانات في الذاكرة مع تأخير ٣٠٠ مللي ثانية.
 *
 * في المتصفح تُحفظ الحالة في localStorage ليشترك تبويب اللوحة وتبويب
 * المدعو في الحالة نفسها (الضغط على واتساب → بانتظار → فتح الدعوة → أكّد).
 * على الخادم أو عند تعطّل التخزين تعمل من الذاكرة فقط.
 *
 * التواقيع هنا هي عقد الطبقة؛ عند ربط Supabase تُستبدل الأجسام وحدها.
 */
import { DEFAULT_TEMPLATES, generateToken } from './message';
import type {
  EventInfo, Guest, GuestStatus, Invitation, MessageTemplate, RsvpInput, SignBy,
} from './types';

export const MOCK_EVENT_ID = 'evt_faisal_2027';
export const MOCK_DELAY_MS = 300;
const STORAGE_KEY = 'barqiyah.manual-whatsapp.v1';

interface Settings {
  templateId: string;
  /** اختيار الداعي الفرعي: باسم من تصدر الدعوة */
  signBy: SignBy;
}

/** صفّ المدعو كما يُخزَّن — يحمل باسم من صدرت دعوته وقت الإرسال */
interface StoredGuest extends Guest {
  signBy?: SignBy;
}

interface Store {
  event: EventInfo;
  guests: StoredGuest[];
  templates: MessageTemplate[];
  settings: Settings;
}

const SEED_EVENT: EventInfo = {
  id: MOCK_EVENT_ID,
  title: 'حفل زواج فيصل العتيبي',
  occasion: 'حفل زواج فيصل العتيبي',
  ownerName: 'عبدالله بن سعد العتيبي',
  subInviterName: 'سعد بن عبدالله العتيبي',
  dateText: 'مساء الجمعة 15 يناير 2027',
  timeText: '8:30 مساءً',
  venue: 'قاعة الريم، الرياض',
  mapUrl: 'https://maps.google.com/?q=%D9%82%D8%A7%D8%B9%D8%A9+%D8%A7%D9%84%D8%B1%D9%8A%D9%85+%D8%A7%D9%84%D8%B1%D9%8A%D8%A7%D8%B6',
  packageSeats: 20,
};

const SEED_GUESTS: { name: string; phoneE164: string; maxSeats: number }[] = [
  { name: 'تركي الدوسري', phoneE164: '+966555100001', maxSeats: 4 },
  { name: 'منصور العنزي', phoneE164: '+966555100002', maxSeats: 2 },
  { name: 'خالد الفهد', phoneE164: '+966555100003', maxSeats: 2 },
  { name: 'فيصل المطيري', phoneE164: '+966555100004', maxSeats: 1 },
  { name: 'سلطان الحربي', phoneE164: '+966555100005', maxSeats: 1 },
];

function seed(): Store {
  return {
    event: { ...SEED_EVENT },
    guests: SEED_GUESTS.map((g, i) => ({
      id: `g_${i + 1}`,
      token: generateToken(),
      ...g,
      status: 'draft',
      attendees: 0,
    })),
    templates: DEFAULT_TEMPLATES.map((t) => ({ ...t })),
    settings: { templateId: 'formal', signBy: 'sub' },
  };
}

let memory: Store | null = null;

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
        if (parsed?.event && Array.isArray(parsed.guests)) {
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

/** نسخة عامة من صفّ المدعو — بلا الحقول الداخلية */
function publicGuest(g: StoredGuest): Guest {
  const { signBy: _signBy, ...guest } = g;
  void _signBy;
  return { ...guest };
}

function findGuest(id: string): StoredGuest {
  const g = load().guests.find((x) => x.id === id);
  if (!g) throw new Error('المدعو غير موجود');
  return g;
}

/* ============================================================
   واجهة اللوحة
   ============================================================ */

export async function getEvent(eventId: string): Promise<EventInfo> {
  const store = load();
  if (eventId !== store.event.id) throw new Error('المناسبة غير موجودة');
  return delay({ ...store.event });
}

export async function listGuests(eventId: string): Promise<Guest[]> {
  const store = load();
  if (eventId !== store.event.id) return delay([]);
  return delay(store.guests.map(publicGuest));
}

/**
 * ضُغط زر واتساب لهذا المدعو: المسودة تصير «بانتظار» وتُحجز مقاعدها.
 * الحالات الأخرى لا تتغيّر (إعادة إرسال لا تمسّ الردّ).
 */
export async function markSent(guestId: string): Promise<Guest> {
  const g = findGuest(guestId);
  if (g.status === 'draft') g.status = 'pending';
  g.signBy = effectiveSignBy();
  persist();
  return delay(publicGuest(g));
}

export async function listTemplates(eventId: string): Promise<MessageTemplate[]> {
  const store = load();
  if (eventId !== store.event.id) return delay([]);
  return delay(store.templates.map((t) => ({ ...t })));
}

export async function saveTemplate(eventId: string, t: MessageTemplate): Promise<MessageTemplate> {
  const store = load();
  if (eventId !== store.event.id) throw new Error('المناسبة غير موجودة');
  const i = store.templates.findIndex((x) => x.id === t.id);
  const next = { ...t };
  if (i >= 0) store.templates[i] = next; else store.templates.push(next);
  persist();
  return delay({ ...next });
}

export async function getSettings(eventId: string): Promise<Settings> {
  const store = load();
  if (eventId !== store.event.id) throw new Error('المناسبة غير موجودة');
  return delay({ ...store.settings });
}

export async function saveSettings(eventId: string, patch: Partial<Settings>): Promise<Settings> {
  const store = load();
  if (eventId !== store.event.id) throw new Error('المناسبة غير موجودة');
  store.settings = { ...store.settings, ...patch };
  persist();
  return delay({ ...store.settings });
}

/* ============================================================
   صفة المستخدم (مفتاح تطوير فقط) — من حساب صاحب المناسبة تصدر الدعوة
   باسمه وحده؛ من حساب الداعي الفرعي يُطبَّق اختياره.
   ============================================================ */

let viewer: 'owner' | 'sub' = 'owner';

export function setViewer(v: 'owner' | 'sub') { viewer = v; }
export function getViewer() { return viewer; }

function effectiveSignBy(): SignBy {
  return viewer === 'owner' ? 'owner' : load().settings.signBy;
}

/* ============================================================
   واجهة صفحة المدعو العامة — تكشف بيانات هذا المدعو وحده
   ============================================================ */

export async function getInvitationByToken(token: string): Promise<Invitation> {
  const store = load();
  const g = store.guests.find((x) => x.token === token);
  if (!g) throw new Error('الرمز غير موجود');
  return delay({
    event: { ...store.event },
    guest: publicGuest(g),
    signBy: g.signBy ?? effectiveSignBy(),
  });
}

/** فتح الصفحة: المسودة أو «بانتظار» تصير «فتح الدعوة» */
export async function markOpened(token: string): Promise<void> {
  const g = load().guests.find((x) => x.token === token);
  if (!g) throw new Error('الرمز غير موجود');
  if (g.status === 'draft' || g.status === 'pending') {
    g.status = 'opened';
    persist();
  }
  return delay(undefined);
}

export async function submitRsvp(token: string, r: RsvpInput): Promise<Guest> {
  const g = load().guests.find((x) => x.token === token);
  if (!g) throw new Error('الرمز غير موجود');
  if (r.attending) {
    const n = Math.round(Number(r.attendees));
    if (!Number.isFinite(n) || n < 1 || n > g.maxSeats) throw new Error('عدد الحضور غير صحيح');
    g.status = 'confirmed';
    g.attendees = n;
  } else {
    g.status = 'declined';
    g.attendees = 0;
  }
  persist();
  return delay(publicGuest(g));
}

/* ============================================================
   أدوات تطوير
   ============================================================ */

/** إعادة البيانات إلى حالتها الأولى (زر في مفتاح التطوير وفي الاختبارات). */
export async function resetMock(): Promise<void> {
  memory = seed();
  persist();
  return delay(undefined);
}

/** تعديل مباشر للاختبارات فقط */
export function _debugSetStatus(guestId: string, status: GuestStatus, attendees = 0) {
  const g = findGuest(guestId);
  g.status = status;
  g.attendees = attendees;
  persist();
}
