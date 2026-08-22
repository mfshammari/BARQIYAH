import { useState } from "react";

/* =====================================================================
   نموذج تجربة المستخدم (Prototype) — منصة إدارة دعوات المناسبات
   منطق الرصيد: بالمقاعد (الأشخاص) — بثلاث حالات: متاح / محجوز / مؤكّد
   الدعوة: حد أقصى معروض (مثال ٧) → المدعو يؤكّد عدداً فعلياً (مثال ٣)
   الرسائل: رسالة مدفوعة واحدة لكل مدعو (منفصلة عن المقاعد)
   الأدوار: الأدمن | صاحب الفعالية | الماسح | المدعو (واتساب)
===================================================================== */

const uid = () => Math.random().toString(36).slice(2, 9);

const STATUS = {
  draft:    { label: "مسودة",           cls: "st-draft"   },
  sent:     { label: "بانتظار الرد",     cls: "st-sent"    },
  accepted: { label: "أكّد الحضور",       cls: "st-accept"  },
  declined: { label: "اعتذر",            cls: "st-decline" },
  expired:  { label: "لم يرد",           cls: "st-expire"  },
  attended: { label: "حضر",             cls: "st-attend"  },
};

const INITIAL_INVITERS = [
  { id: "own", name: "محمد العبدالله", role: "المالك" },
  { id: "inv2", name: "أحمد العبدالله", role: "داعٍ" },
  { id: "inv3", name: "سعد العبدالله", role: "داعٍ" },
];

/* max = الحد الأقصى المعروض | confirmed = ما أكّده المدعو */
const INITIAL_GUESTS = [
  { id: uid(), name: "خالد الفهد",       phone: "0551000001", max: 4, confirmed: 2,    inviter: "own",  status: "accepted", scansUsed: 0 },
  { id: uid(), name: "نايف السالم",      phone: "0551000002", max: 2, confirmed: 1,    inviter: "inv2", status: "attended", scansUsed: 1 },
  { id: uid(), name: "فيصل المطيري",     phone: "0551000003", max: 7, confirmed: null, inviter: "own",  status: "sent",     scansUsed: 0 },
  { id: uid(), name: "عبدالله القحطاني", phone: "0551000004", max: 3, confirmed: null, inviter: "inv3", status: "declined", scansUsed: 0 },
  { id: uid(), name: "منصور العنزي",     phone: "0551000006", max: 6, confirmed: null, inviter: "own",  status: "expired",  scansUsed: 0 },
  { id: uid(), name: "تركي الدوسري",     phone: "0551000005", max: 5, confirmed: null, inviter: "inv2", status: "draft",    scansUsed: 0 },
];

const APPROVED_TEMPLATES = [
  { id: "t1", name: "كلاسيكي — ذهبي", note: "إطار ذهبي فخم، مناسب للأعراس" },
  { id: "t2", name: "بسيط — أبيض", note: "تصميم نظيف وهادئ" },
  { id: "t3", name: "مودرن — رمادي", note: "خطوط عصرية" },
];

/* حساب حالات الرصيد */
function useBalance(guests, quota) {
  const held = guests.filter((g) => g.status === "sent").reduce((s, g) => s + g.max, 0);
  const confirmed = guests
    .filter((g) => g.status === "accepted" || g.status === "attended")
    .reduce((s, g) => s + (g.confirmed || 0), 0);
  const available = quota - held - confirmed;
  const messages = guests.filter((g) => g.status !== "draft").length;
  return { held, confirmed, available, messages };
}

export default function App() {
  const [role, setRole] = useState("client");
  const [event] = useState({
    host: "أسرة العبدالله", occasion: "حفل زواج",
    buyerName: "محمد العبدالله", buyerPhone: "0555123456",
    quota: 300, packageName: "باقة ٣٠٠ مقعد", active: true,
  });
  const [guests, setGuests] = useState(INITIAL_GUESTS);
  const [inviters, setInviters] = useState(INITIAL_INVITERS);
  const [chosenTemplate, setChosenTemplate] = useState("t1");

  const bal = useBalance(guests, event.quota);

  return (
    <div className="pt-root" dir="rtl" lang="ar">
      <StyleTag />
      <div className="pt-bar">
        <div className="pt-bar-title"><span className="pt-dot" /> معاينة النموذج — تنقّل بين الأدوار</div>
        <div className="pt-roles">
          {[["client", "صاحب الفعالية"], ["admin", "الأدمن"], ["scanner", "الماسح"], ["guest", "المدعو (واتساب)"]].map(([k, l]) => (
            <button key={k} className={"pt-role " + (role === k ? "on" : "")} onClick={() => setRole(k)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="pt-stage">
        {role === "client" && (
          <ClientApp event={event} guests={guests} setGuests={setGuests} inviters={inviters} setInviters={setInviters}
            bal={bal} chosenTemplate={chosenTemplate} setChosenTemplate={setChosenTemplate} />
        )}
        {role === "admin" && <AdminApp />}
        {role === "scanner" && <ScannerApp guests={guests} setGuests={setGuests} inviters={inviters} />}
        {role === "guest" && <GuestApp event={event} guests={guests} setGuests={setGuests} inviters={inviters} />}
      </div>
    </div>
  );
}

/* ============================ صاحب الفعالية ============================ */
function ClientApp({ event, guests, setGuests, inviters, setInviters, bal, chosenTemplate, setChosenTemplate }) {
  const [screen, setScreen] = useState("dashboard");
  const nav = [
    ["dashboard", "لوحة المعلومات", "▤"], ["guests", "المدعوون", "☰"], ["inviters", "الدعاة", "◑"],
    ["templates", "قالب الدعوة", "▧"], ["scanners", "حسابات المسح", "◫"], ["info", "بيانات المناسبة", "✎"],
  ];
  return (
    <div className="cl-shell">
      <aside className="cl-side">
        <div className="cl-logo"><span className="cl-logo-mark">◈</span><span className="cl-logo-text">لوحة الفعالية</span></div>
        <div className="cl-host">
          <div className="cl-host-lbl">الدعوة باسم</div>
          <div className="cl-host-name">{event.host}</div>
          <div className="cl-host-occ">{event.occasion}</div>
        </div>
        <nav className="cl-nav">
          {nav.map(([k, l, ic]) => (
            <button key={k} className={"cl-nav-item " + (screen === k ? "on" : "")} onClick={() => setScreen(k)}>
              <span className="cl-nav-ic">{ic}</span> {l}
            </button>
          ))}
        </nav>
        <div className="cl-user">
          <div className="cl-avatar">{event.buyerName.charAt(0)}</div>
          <div><div className="cl-user-name">{event.buyerName}</div><div className="cl-user-sub">{event.packageName}</div></div>
        </div>
      </aside>
      <main className="cl-main">
        {screen === "dashboard" && <ClientDashboard event={event} guests={guests} bal={bal} inviters={inviters} onGo={setScreen} />}
        {screen === "guests" && <ClientGuests guests={guests} setGuests={setGuests} inviters={inviters} bal={bal} />}
        {screen === "inviters" && <ClientInviters inviters={inviters} setInviters={setInviters} guests={guests} />}
        {screen === "templates" && <ClientTemplates chosen={chosenTemplate} setChosen={setChosenTemplate} />}
        {screen === "scanners" && <ClientScanners />}
        {screen === "info" && <ClientInfo event={event} bal={bal} />}
      </main>
    </div>
  );
}

function ClientDashboard({ event, guests, bal, inviters, onGo }) {
  const pctConf = Math.round((bal.confirmed / event.quota) * 100);
  const pctHeld = Math.round((bal.held / event.quota) * 100);
  const accepted = guests.filter((g) => g.status === "accepted" || g.status === "attended").length;
  const declined = guests.filter((g) => g.status === "declined").length;
  const attended = guests.filter((g) => g.status === "attended").length;
  const pending = guests.filter((g) => g.status === "sent").length;

  return (
    <div className="scr">
      <ScreenHead title="لوحة المعلومات" sub={`نظرة عامة على ${event.occasion} — ${event.host}`} />

      {/* الرصيد بثلاث حالات */}
      <div className="bal-card">
        <div className="bal-head">
          <div className="bal-title">رصيد المقاعد <span className="bal-total">من {event.quota}</span></div>
          {bal.available <= 40 && <button className="btn btn-up" onClick={() => onGo("info")}>شراء مقاعد ↑</button>}
        </div>
        <div className="bal-track">
          <div className="bal-seg conf" style={{ width: pctConf + "%" }} />
          <div className="bal-seg held" style={{ width: pctHeld + "%" }} />
        </div>
        <div className="bal-legend">
          <BalItem c="conf" n={bal.confirmed} l="مؤكّد (مستهلك)" />
          <BalItem c="held" n={bal.held} l="محجوز بانتظار الرد" />
          <BalItem c="avail" n={bal.available} l="متاح" />
        </div>
        <div className="bal-note">
          <span>📩 الرسائل المُرسلة: <b>{bal.messages}</b> <span className="muted">(تكلفة الواتساب — رسالة لكل مدعو)</span></span>
          {pending > 0 && <span className="bal-pending">⏳ {pending} دعوة معلّقة تحجز {bal.held} مقعد</span>}
        </div>
      </div>

      <div className="dash-stats">
        <MiniStat n={accepted} l="أكّدوا الحضور" tone="accept" />
        <MiniStat n={pending} l="بانتظار الرد" tone="sent" />
        <MiniStat n={declined} l="اعتذروا" tone="decline" />
        <MiniStat n={attended} l="حضروا الحفل" tone="attend" />
      </div>

      <div className="dash-two">
        <div className="card">
          <div className="card-head"><h3>أحدث المدعوين</h3><button className="link" onClick={() => onGo("guests")}>الكل ←</button></div>
          {guests.slice(0, 4).map((g) => (
            <div className="mini-row" key={g.id}>
              <div className="mini-name"><span className="av sm">{g.name.charAt(0)}</span>{g.name}
                <span className="seat-mini">{g.confirmed != null ? `${g.confirmed}` : `≤${g.max}`}</span>
              </div>
              <StatusChip status={g.status} />
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-head"><h3>الدعوات حسب الداعي</h3><button className="link" onClick={() => onGo("inviters")}>إدارة ←</button></div>
          {inviters.map((iv) => {
            const seats = guests.filter((g) => g.inviter === iv.id && (g.status === "accepted" || g.status === "attended")).reduce((s, g) => s + (g.confirmed || 0), 0);
            return (
              <div className="mini-row" key={iv.id}>
                <div className="mini-name"><span className="av sm">{iv.name.charAt(0)}</span>{iv.name}<span className="tag-role">{iv.role}</span></div>
                <span className="count-pill">{seats} مقعد</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
const BalItem = ({ c, n, l }) => (
  <div className="bal-item"><span className={"bal-chip " + c} /><div><div className="bal-item-n">{n}</div><div className="bal-item-l">{l}</div></div></div>
);

function ClientGuests({ guests, setGuests, inviters, bal }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [flash, setFlash] = useState("");

  const invName = (id) => (inviters.find((i) => i.id === id) || {}).name || "—";
  const list = guests.filter((g) => (filter === "all" ? true : g.status === filter)).filter((g) => !q || g.name.includes(q) || g.phone.includes(q));

  const addGuest = (g) => setGuests((p) => [{ ...g, id: uid(), confirmed: null, scansUsed: 0 }, ...p]);
  const del = (id) => setGuests((p) => p.filter((g) => g.id !== id));
  const send = (g) => {
    if (g.max > bal.available) { setFlash(`لا يمكن الإرسال — تحتاج ${g.max - bal.available} مقعد إضافي.`); setTimeout(() => setFlash(""), 3000); return; }
    setGuests((p) => p.map((x) => (x.id === g.id ? { ...x, status: "sent" } : x)));
  };

  return (
    <div className="scr">
      <ScreenHead title="المدعوون" sub={`متاح ${bal.available} مقعد · محجوز ${bal.held} · مؤكّد ${bal.confirmed}`}
        action={<button className="btn btn-primary" onClick={() => setOpen(true)}>+ إضافة مدعو</button>} />

      {flash && <div className="flash">{flash}</div>}

      <div className="toolbar">
        <input className="input flex1" placeholder="ابحث بالاسم أو الجوال…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          {[["all", "الكل"], ["draft", "مسودة"], ["sent", "بانتظار"], ["accepted", "أكّدوا"], ["declined", "اعتذروا"], ["expired", "لم يردوا"], ["attended", "حضروا"]].map(([k, l]) => (
            <button key={k} className={"seg-b " + (filter === k ? "on" : "")} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="table">
        <div className="tr th">
          <div>المدعو</div><div>الجوال</div><div>المقاعد</div><div>الداعي</div><div>الحالة</div><div></div>
        </div>
        {list.map((g) => (
          <div className="tr" key={g.id}>
            <div className="cell-name"><span className="av">{g.name.charAt(0)}</span>{g.name}</div>
            <div className="muted">{g.phone}</div>
            <div>
              {g.confirmed != null
                ? <span className="seats confirmed">{g.confirmed} <span className="seats-of">من {g.max}</span></span>
                : <span className="seats offered">حد أقصى {g.max}</span>}
            </div>
            <div className="muted sm2">{invName(g.inviter)}</div>
            <div><StatusChip status={g.status} /></div>
            <div className="row-actions">
              <button className="link-mini" onClick={() => setDetail(g)}>تفاصيل</button>
              {g.status === "draft" && <button className="btn btn-mini" onClick={() => send(g)}>إرسال</button>}
              <button className="icon-btn" onClick={() => del(g.id)}>✕</button>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="empty-lite">لا يوجد مدعوون بهذا التصنيف.</div>}
      </div>

      {open && <AddGuestModal inviters={inviters} available={bal.available} onClose={() => setOpen(false)} onSave={(g) => { addGuest(g); setOpen(false); }} />}
      {detail && <GuestDetailModal g={detail} invName={invName(detail.inviter)} onClose={() => setDetail(null)} />}
    </div>
  );
}

function AddGuestModal({ inviters, available, onClose, onSave }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [max, setMax] = useState(2);
  const [inviter, setInviter] = useState(inviters[0].id);
  const [sendNow, setSendNow] = useState(true);
  const [err, setErr] = useState("");

  const overBudget = sendNow && max > available;

  const submit = () => {
    if (!name.trim()) return setErr("اكتب اسم المدعو.");
    if (!phone.trim()) return setErr("اكتب رقم الجوال.");
    if (overBudget) return setErr(`الحجز (${max}) يتجاوز المتاح (${available}). قلّل الحد أو اشترِ مقاعد.`);
    onSave({ name: name.trim(), phone: phone.trim(), max: Number(max) || 1, inviter, status: sendNow ? "sent" : "draft" });
  };

  return (
    <Modal title="إضافة مدعو" onClose={onClose}>
      <div className="field"><label>اسم المدعو</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم الكامل" /></div>
      <div className="row2">
        <div className="field"><label>رقم الجوال (واتساب)</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xxxxxxxx" /></div>
        <div className="field">
          <label>الحد الأقصى للأشخاص</label>
          <div className="stepper">
            <button onClick={() => setMax((c) => Math.max(1, c - 1))}>−</button><span>{max}</span><button onClick={() => setMax((c) => c + 1)}>+</button>
          </div>
        </div>
      </div>
      <div className="field">
        <label>الداعي</label>
        <select className="input" value={inviter} onChange={(e) => setInviter(e.target.value)}>
          {inviters.map((i) => <option key={i.id} value={i.id}>{i.name} — {i.role}</option>)}
        </select>
      </div>

      {sendNow && (
        <div className={"hold-box " + (overBudget ? "bad" : "")}>
          <span>سيُحجز <b>{max}</b> مقعد فور الإرسال — يُخصم النهائي بعد رد المدعو.</span>
          <span className="hold-avail">المتاح: {available}</span>
        </div>
      )}

      <div className="toggle-row" onClick={() => setSendNow((s) => !s)}>
        <div><div className="toggle-title">إرسال الدعوة الآن</div>
          <div className="hint">{sendNow ? "تُرسل عبر واتساب وتحجز المقاعد." : "تُحفظ كمسودة بدون حجز."}</div></div>
        <div className={"switch " + (sendNow ? "on" : "")}><span /></div>
      </div>

      {err && <div className="err">{err}</div>}
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
        <button className={"btn btn-primary" + (overBudget ? " disabled" : "")} onClick={submit}>{sendNow ? "إضافة وإرسال" : "حفظ كمسودة"}</button>
      </div>
    </Modal>
  );
}

function GuestDetailModal({ g, invName, onClose }) {
  const released = g.confirmed != null ? g.max - g.confirmed : 0;
  const steps = [];
  steps.push({ t: "أُرسلت الدعوة", d: `حد أقصى ${g.max} — حُجز ${g.max} مقعد`, on: true });
  if (["accepted", "attended", "declined"].includes(g.status)) steps.push({ t: "فتح المدعو الدعوة", on: true });
  if (g.status === "declined") steps.push({ t: "اعتذر عن الحضور", d: "أُفرج عن كامل الحجز", on: true, bad: true });
  if (g.status === "expired") steps.push({ t: "انتهت المدة دون رد", d: `أُفرج عن ${g.max} مقعد`, on: true, bad: true });
  if (g.status === "sent") steps.push({ t: "بانتظار رد المدعو…", d: `${g.max} مقعد محجوز مؤقتاً`, pending: true });
  if (["accepted", "attended"].includes(g.status)) {
    steps.push({ t: `أكّد الحضور — ${g.confirmed} أشخاص`, d: released > 0 ? `أُفرج عن ${released} مقعد` : "استخدم كامل الحد", on: true });
    steps.push({ t: "اعتُمد تلقائياً", d: "ضمن الحد الذي حدّدته", on: true });
    steps.push({ t: "صدر الباركود", d: `صالح لـ ${g.confirmed} أشخاص`, on: true });
  }
  if (g.status === "attended") steps.push({ t: "حضر الحفل ✓", d: `مُسح ${g.scansUsed} من ${g.confirmed}`, on: true, good: true });

  return (
    <Modal title={g.name} onClose={onClose}>
      <div className="gd-top">
        <div className="gd-box"><div className="gd-box-n">{g.max}</div><div className="gd-box-l">الحد المعروض</div></div>
        <div className="gd-arrow">←</div>
        <div className="gd-box on"><div className="gd-box-n">{g.confirmed != null ? g.confirmed : "—"}</div><div className="gd-box-l">المؤكّد</div></div>
        {released > 0 && <><div className="gd-arrow">↻</div><div className="gd-box rel"><div className="gd-box-n">{released}</div><div className="gd-box-l">أُفرج عنه</div></div></>}
      </div>
      <div className="gd-meta"><span className="muted">الجوال: {g.phone}</span><span className="muted">الداعي: {invName}</span></div>
      <div className="timeline">
        {steps.map((s, i) => (
          <div className={"tl-row " + (s.pending ? "pending" : s.bad ? "bad" : s.good ? "good" : "")} key={i}>
            <div className="tl-dot" /><div className="tl-body"><div className="tl-t">{s.t}</div>{s.d && <div className="tl-d">{s.d}</div>}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function ClientInviters({ inviters, setInviters, guests }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const add = () => { if (name.trim()) { setInviters((p) => [...p, { id: uid(), name: name.trim(), role: "داعٍ" }]); setName(""); setOpen(false); } };
  return (
    <div className="scr">
      <ScreenHead title="الدعاة" sub="أضف مستخدمين يدعون ضيوفهم، وكل مدعو يظهر باسم داعيه."
        action={<button className="btn btn-primary" onClick={() => setOpen(true)}>+ إضافة داعٍ</button>} />
      <div className="cards-grid">
        {inviters.map((iv) => {
          const total = guests.filter((g) => g.inviter === iv.id).length;
          const seats = guests.filter((g) => g.inviter === iv.id && (g.status === "accepted" || g.status === "attended")).reduce((s, g) => s + (g.confirmed || 0), 0);
          return (
            <div className="inv-card" key={iv.id}>
              <div className="inv-top"><span className="av lg">{iv.name.charAt(0)}</span>{iv.role === "المالك" && <span className="tag-role owner">المالك</span>}</div>
              <div className="inv-name">{iv.name}</div>
              <div className="inv-stats"><span><b>{total}</b> مدعو</span><span><b>{seats}</b> مقعد مؤكّد</span></div>
            </div>
          );
        })}
      </div>
      {open && (
        <Modal title="إضافة داعٍ" onClose={() => setOpen(false)}>
          <div className="field"><label>اسم الداعي</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم" /></div>
          <div className="hint">سيُنشأ له حساب دخول خاص (يوزر/باسورد) لإدارة مدعوينه.</div>
          <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setOpen(false)}>إلغاء</button><button className="btn btn-primary" onClick={add}>إضافة</button></div>
        </Modal>
      )}
    </div>
  );
}

function ClientTemplates({ chosen, setChosen }) {
  const [reqOpen, setReqOpen] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <div className="scr">
      <ScreenHead title="قالب الدعوة" sub="اختر قالباً معتمداً، أو اطلب قالباً خاصاً بك."
        action={<button className="btn btn-ghost" onClick={() => setReqOpen(true)}>طلب قالب خاص</button>} />
      <div className="tpl-grid">
        {APPROVED_TEMPLATES.map((t) => (
          <div key={t.id} className={"tpl-card " + (chosen === t.id ? "on" : "")} onClick={() => setChosen(t.id)}>
            <div className="tpl-preview">دعوة</div><div className="tpl-name">{t.name}</div><div className="tpl-note">{t.note}</div>
            {chosen === t.id && <div className="tpl-check">✓ مختار</div>}
          </div>
        ))}
      </div>
      {reqOpen && (
        <Modal title="طلب قالب خاص" onClose={() => { setReqOpen(false); setSent(false); }}>
          {!sent ? (<>
            <div className="field"><label>وصف القالب المطلوب</label><textarea className="input" rows={3} placeholder="اشرح الفكرة، الألوان، النص…" /></div>
            <div className="field"><label>صورة/تصميم مرفق</label><div className="upload">اسحب الصورة هنا أو اضغط للرفع</div></div>
            <div className="hint">يُرسل للأدمن → مراجعة → قبول/رفض. بعد القبول يظهر ضمن قوالبك.</div>
            <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setReqOpen(false)}>إلغاء</button><button className="btn btn-primary" onClick={() => setSent(true)}>إرسال الطلب</button></div>
          </>) : (<div className="sent-ok"><div className="sent-ic">✓</div><div>أُرسل طلبك. حالته الآن: <b>قيد المراجعة</b>.</div></div>)}
        </Modal>
      )}
    </div>
  );
}

function ClientScanners() {
  const [rows, setRows] = useState([{ id: uid(), user: "scan_gate1", label: "بوابة الرجال" }]);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  return (
    <div className="scr">
      <ScreenHead title="حسابات المسح" sub="أنشئ حسابات للماسحين على الأبواب. الدخول بيوزر/باسورد."
        action={<button className="btn btn-primary" onClick={() => setOpen(true)}>+ حساب ماسح</button>} />
      <div className="table">
        <div className="tr th sc"><div>الوصف</div><div>اسم المستخدم</div><div></div></div>
        {rows.map((r) => (
          <div className="tr sc" key={r.id}><div className="cell-name">{r.label}</div><div className="muted mono">{r.user}</div>
            <div className="row-actions"><button className="icon-btn" onClick={() => setRows((p) => p.filter((x) => x.id !== r.id))}>✕</button></div></div>
        ))}
      </div>
      {open && (
        <Modal title="حساب ماسح جديد" onClose={() => setOpen(false)}>
          <div className="field"><label>الوصف</label><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثال: بوابة النساء" /></div>
          <div className="hint">سيُولّد له اسم مستخدم وكلمة مرور تلقائياً.</div>
          <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setOpen(false)}>إلغاء</button>
            <button className="btn btn-primary" onClick={() => { setRows((p) => [...p, { id: uid(), user: "scan_" + uid().slice(0, 4), label: label || "بوابة" }]); setOpen(false); setLabel(""); }}>إنشاء</button></div>
        </Modal>
      )}
    </div>
  );
}

function ClientInfo({ event, bal }) {
  return (
    <div className="scr">
      <ScreenHead title="بيانات المناسبة" sub="البيانات اللي أدخلتها عند الشراء — تظهر في لوحتك وفي الدعوة." />
      <div className="info-card">
        <InfoRow l="اسم المشتري" v={event.buyerName} /><InfoRow l="جوال المشتري" v={event.buyerPhone} />
        <InfoRow l="الدعوة باسم" v={event.host} /><InfoRow l="نوع المناسبة" v={event.occasion} /><InfoRow l="الباقة" v={event.packageName} />
      </div>
      <div className="info-card">
        <div className="card-head"><h3>رصيد المقاعد</h3></div>
        <p className="muted">باقتك {event.quota} مقعد · متاح الآن <b>{bal.available}</b> · محجوز {bal.held} · مؤكّد {bal.confirmed}.</p>
        <div className="up-actions"><button className="btn btn-ghost">شراء مقاعد إضافية</button><button className="btn btn-primary">ترقية الباقة</button></div>
      </div>
    </div>
  );
}
const InfoRow = ({ l, v }) => (<div className="info-row"><span className="info-l">{l}</span><span className="info-v">{v}</span></div>);

/* ============================ الأدمن ============================ */
function AdminApp() {
  const [tab, setTab] = useState("events");
  const [reqs, setReqs] = useState([
    { id: uid(), client: "أسرة العبدالله", desc: "قالب بخلفية خضراء وخط ديواني", status: "pending" },
    { id: uid(), client: "أسرة الحربي", desc: "قالب زواج بألوان وردية", status: "pending" },
  ]);
  const setReq = (id, status) => setReqs((p) => p.map((r) => (r.id === id ? { ...r, status } : r)));
  return (
    <div className="ad-shell">
      <div className="ad-head"><h2>لوحة الأدمن</h2>
        <div className="tabs">{[["events", "الفعاليات"], ["packages", "الباقات"], ["templates", "القوالب والطلبات"], ["integration", "إعدادات الواتساب"]].map(([k, l]) => (
          <button key={k} className={"tab " + (tab === k ? "on" : "")} onClick={() => setTab(k)}>{l}</button>))}</div>
      </div>

      {tab === "events" && (<div className="ad-body">
        <div className="dash-stats four">
          <MiniStat n={12} l="فعاليات نشطة" tone="accept" /><MiniStat n={5} l="بانتظار التفعيل" tone="draft" />
          <MiniStat n={"٣٬٤٥٠"} l="مقاعد مؤكّدة" tone="attend" /><MiniStat n={2} l="طلبات قوالب" tone="decline" />
        </div>
        <div className="table">
          <div className="tr th ev"><div>الفعالية</div><div>المالك</div><div>الباقة</div><div>مؤكّد</div><div>الحالة</div></div>
          {[["حفل زواج", "محمد العبدالله", "٣٠٠", "١٢٠", "نشطة"], ["حفل تخرج", "سارة الأحمد", "١٠٠", "٠", "بانتظار التفعيل"], ["زواج", "خالد النمر", "٦٠٠", "٥٩٠", "نشطة"]].map((r, i) => (
            <div className="tr ev" key={i}><div className="cell-name">{r[0]}</div><div className="muted">{r[1]}</div><div>{r[2]}</div><div>{r[3]}</div>
              <div>{r[4] === "نشطة" ? <span className="chip st-accept">نشطة</span> : <button className="btn btn-mini btn-primary">تفعيل يدوي</button>}</div></div>
          ))}
        </div>
      </div>)}

      {tab === "packages" && (<div className="ad-body">
        <div className="between"><h3>الباقات (بعدد المقاعد)</h3><button className="btn btn-primary">+ باقة جديدة</button></div>
        <div className="pkg-grid">{[["أساسية", 100, 299], ["قياسية", 300, 699], ["مميزة", 600, 1199]].map(([n, q, p], i) => (
          <div className="pkg-card" key={i}><div className="pkg-name">{n}</div><div className="pkg-q">{q} <span>مقعد</span></div><div className="pkg-p">{p} ﷼</div><button className="btn btn-ghost full">تعديل</button></div>))}</div>
      </div>)}

      {tab === "templates" && (<div className="ad-body">
        <div className="between"><h3>مكتبة القوالب المعتمدة</h3><button className="btn btn-primary">+ قالب معتمد</button></div>
        <div className="tpl-grid mb">{APPROVED_TEMPLATES.map((t) => (<div className="tpl-card mini" key={t.id}><div className="tpl-preview sm">دعوة</div><div className="tpl-name">{t.name}</div></div>))}</div>
        <h3 className="mt">طلبات القوالب الخاصة</h3>
        <div className="table"><div className="tr th rq"><div>العميل</div><div>الوصف</div><div>الإجراء</div></div>
          {reqs.map((r) => (<div className="tr rq" key={r.id}><div className="cell-name">{r.client}</div><div className="muted">{r.desc}</div>
            <div>{r.status === "pending" ? (<div className="row-actions"><button className="btn btn-mini btn-primary" onClick={() => setReq(r.id, "approved")}>قبول</button><button className="btn btn-mini btn-danger-o" onClick={() => setReq(r.id, "rejected")}>رفض</button></div>) : <span className={"chip " + (r.status === "approved" ? "st-accept" : "st-decline")}>{r.status === "approved" ? "مقبول" : "مرفوض"}</span>}</div></div>))}
        </div>
      </div>)}

      {tab === "integration" && (<div className="ad-body">
        <div className="info-card"><div className="card-head"><h3>ربط مزوّد الواتساب</h3></div>
          <p className="muted">إعدادات محايدة تعمل مع أي مزوّد (Unifonic / Twilio / 360dialog…).</p>
          <div className="field"><label>المزوّد</label><select className="input"><option>Unifonic</option><option>Twilio</option><option>360dialog</option><option>مخصص</option></select></div>
          <div className="row2"><div className="field"><label>API Key</label><input className="input mono" placeholder="••••••••••••" /></div>
            <div className="field"><label>رقم المُرسل (WABA)</label><input className="input mono" placeholder="+9665xxxxxxxx" /></div></div>
          <div className="field"><label>رابط الـ Webhook</label><input className="input mono" value="https://app.example.com/api/whatsapp/webhook" readOnly /></div>
          <button className="btn btn-primary">حفظ الإعدادات</button>
        </div>
      </div>)}
    </div>
  );
}

/* ============================ الماسح ============================ */
function ScannerApp({ guests, setGuests, inviters }) {
  const [result, setResult] = useState(null);
  const invName = (id) => (inviters.find((i) => i.id === id) || {}).name || "—";
  const scannable = guests.filter((g) => g.status === "accepted" || g.status === "attended");
  const scan = (g) => {
    if (g.scansUsed >= (g.confirmed || 0)) { setResult({ type: "used", g }); return; }
    setGuests((p) => p.map((x) => (x.id === g.id ? { ...x, scansUsed: x.scansUsed + 1, status: "attended" } : x)));
    setResult({ type: "ok", g: { ...g, scansUsed: g.scansUsed + 1 } });
  };
  return (
    <div className="sc-shell">
      <div className="sc-card">
        <div className="sc-title">مسح الباركود على الباب</div>
        <div className="sc-frame"><div className="sc-laser" /><span className="sc-hint">وجّه الكاميرا نحو الباركود</span></div>
        {result && (
          <div className={"sc-res " + (result.type === "ok" ? "ok" : "bad")}>
            {result.type === "ok" ? (<>
              <div className="sc-res-ic">✓</div><div className="sc-res-name">{result.g.name}</div>
              <div className="sc-res-sub">دعاه: {invName(result.g.inviter)}</div>
              <div className="sc-res-count">دخول {result.g.scansUsed} من {result.g.confirmed}</div>
            </>) : (<>
              <div className="sc-res-ic">✕</div><div className="sc-res-name">الكود مُستخدم بالكامل</div>
              <div className="sc-res-sub">{result.g.name} — استُخدمت كل المقاعد ({result.g.confirmed})</div>
            </>)}
          </div>
        )}
        <div className="sc-sim">
          <div className="sc-sim-lbl">— محاكاة: اضغط على باركود مدعو —</div>
          {scannable.map((g) => (
            <button key={g.id} className="sc-sim-btn" onClick={() => scan(g)}><span>{g.name}</span><span className="sc-sim-count">{g.scansUsed}/{g.confirmed}</span></button>
          ))}
          {scannable.length === 0 && <div className="empty-lite">لا يوجد مدعوون أكّدوا الحضور بعد.</div>}
        </div>
      </div>
    </div>
  );
}

/* ============================ المدعو (واتساب) ============================ */
function GuestApp({ event, guests, setGuests, inviters }) {
  const [pick, setPick] = useState(guests[0]?.id);
  const [choosing, setChoosing] = useState(false);
  const [sel, setSel] = useState(1);
  const g = guests.find((x) => x.id === pick) || guests[0];
  const invName = (id) => (inviters.find((i) => i.id === id) || {}).name || "—";

  const decline = () => setGuests((p) => p.map((x) => (x.id === g.id ? { ...x, status: "declined" } : x)));
  const startChoose = () => { setSel(1); setChoosing(true); };
  const confirm = () => { setGuests((p) => p.map((x) => (x.id === g.id ? { ...x, status: "accepted", confirmed: sel } : x))); setChoosing(false); };

  return (
    <div className="gs-shell">
      <div className="gs-picker">
        <label>معاينة كأنك المدعو:</label>
        <select className="input" value={pick} onChange={(e) => { setPick(e.target.value); setChoosing(false); }}>
          {guests.map((x) => <option key={x.id} value={x.id}>{x.name} — {STATUS[x.status].label}</option>)}
        </select>
      </div>

      <div className="gs-phone">
        <div className="gs-wa-top"><span className="gs-wa-av">◈</span><div><div className="gs-wa-name">دعوات {event.host}</div><div className="gs-wa-on">متصل الآن</div></div></div>
        <div className="gs-chat">
          <div className="gs-bubble">
            <div className="gs-inv-card">
              <div className="gs-inv-img">تصميم الدعوة</div>
              <div className="gs-inv-body">
                <div className="gs-inv-occ">{event.occasion}</div>
                <div className="gs-inv-host">بمناسبة {event.host}</div>
                <div className="gs-inv-hi">عزيزنا {g.name}،</div>
                <div className="gs-inv-txt">يسرّنا دعوتكم لحضور المناسبة. نأمل تشريفكم.</div>
                <div className="gs-inv-by">دعاك: {invName(g.inviter)}</div>
              </div>
            </div>
            {g.status === "sent" && !choosing && (
              <div className="gs-actions"><button className="gs-btn accept" onClick={startChoose}>✓ تأكيد الحضور</button><button className="gs-btn decline" onClick={decline}>✕ اعتذار</button></div>
            )}
          </div>

          {/* خطوة اختيار العدد داخل الجلسة (بدون تكلفة إضافية) */}
          {g.status === "sent" && choosing && (
            <div className="gs-bubble in choose">
              <div className="gs-choose-q">كم عدد الحضور؟ <span className="muted">(حتى {g.max})</span></div>
              <div className="gs-choose-grid">
                {Array.from({ length: g.max }, (_, i) => i + 1).map((n) => (
                  <button key={n} className={"gs-num " + (sel === n ? "on" : "")} onClick={() => setSel(n)}>{n}</button>
                ))}
              </div>
              <button className="gs-confirm" onClick={confirm}>تأكيد {sel} {sel === 1 ? "شخص" : "أشخاص"}</button>
            </div>
          )}

          {(g.status === "accepted" || g.status === "attended") && (
            <div className="gs-bubble in">
              <div className="gs-qr-title">تم تأكيد حضورك ✓</div>
              <FakeQR seed={g.id} />
              <div className="gs-qr-note">أظهر هذا الباركود عند الدخول</div>
              <div className="gs-qr-count">صالح لـ {g.confirmed} {g.confirmed === 1 ? "شخص" : "أشخاص"}</div>
            </div>
          )}
          {g.status === "declined" && <div className="gs-bubble in decline">شكراً لإعلامنا. نعتذر لعدم تمكنكم من الحضور 🌿</div>}
          {g.status === "expired" && <div className="gs-note">انتهت مدة الدعوة دون رد — أُفرج عن الحجز.</div>}
          {g.status === "draft" && <div className="gs-note">هذه الدعوة مسودة — لم تُرسل بعد.</div>}
        </div>
      </div>
    </div>
  );
}

/* ============================ عناصر مشتركة ============================ */
function ScreenHead({ title, sub, action }) {
  return (<div className="scr-head"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>{action}</div>);
}
function MiniStat({ n, l, tone }) { return (<div className={"mstat " + tone}><div className="mstat-n">{n}</div><div className="mstat-l">{l}</div></div>); }
function StatusChip({ status }) { const s = STATUS[status]; return <span className={"chip " + s.cls}>{s.label}</span>; }
function Modal({ title, children, onClose }) {
  return (<div className="overlay" onClick={onClose}><div className="modal" onClick={(e) => e.stopPropagation()}>
    <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}>✕</button></div>
    <div className="modal-body">{children}</div></div></div>);
}
function FakeQR({ seed }) {
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffff;
  const N = 13, cells = [];
  const rng = () => { h = (h * 1103515245 + 12345) & 0x7fffffff; return h / 0x7fffffff; };
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const corner = (r < 3 && c < 3) || (r < 3 && c > N - 4) || (r > N - 4 && c < 3);
    cells.push(corner ? ((r === 0 || r === 2 || c === 0 || c === 2 || (r === 1 && c === 1) || (r <= 2 && c <= 2)) ? 1 : 0) : (rng() > 0.5 ? 1 : 0));
  }
  return (<div className="fqr" style={{ gridTemplateColumns: `repeat(${N},1fr)` }}>{cells.map((v, i) => <span key={i} className={v ? "on" : ""} />)}</div>);
}

/* ============================ التنسيقات ============================ */
function StyleTag() {
  return (<style>{`
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Tajawal:wght@500;700;800&display=swap');
:root{--bg:#F4F5F7;--panel:#FFFFFF;--ink:#1C2433;--muted:#727C8C;--line:#E7EAF0;
--brand:#3B5BDB;--brand-d:#2F49B2;--brand-soft:#EDF1FE;--ok:#12A57E;--ok-soft:#E4F6EF;
--warn:#E8A13B;--warn-soft:#FCF2E1;--danger:#E5484D;--danger-soft:#FDECED;
--font:'IBM Plex Sans Arabic',system-ui,sans-serif;--disp:'Tajawal',var(--font);--r:14px;}
.pt-root *{box-sizing:border-box;margin:0;padding:0}
.pt-root{font-family:var(--font);background:var(--bg);color:var(--ink);min-height:100vh;-webkit-font-smoothing:antialiased;line-height:1.55;font-size:14px}
.pt-root button{font-family:inherit;cursor:pointer}.pt-root input,.pt-root select,.pt-root textarea{font-family:inherit}
.pt-bar{background:#181F2E;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:10px 18px;gap:12px;flex-wrap:wrap;position:sticky;top:0;z-index:40}
.pt-bar-title{font-size:12.5px;color:#9AA6BC;display:flex;align-items:center;gap:8px}
.pt-dot{width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 3px rgba(18,165,126,.25)}
.pt-roles{display:flex;gap:6px;flex-wrap:wrap}
.pt-role{background:#28324660;color:#C4CDDE;border:1px solid #ffffff14;padding:7px 13px;border-radius:9px;font-size:13px;font-weight:600;transition:.15s}
.pt-role:hover{background:#2b3650}.pt-role.on{background:var(--brand);color:#fff;border-color:transparent}
.pt-stage{animation:fade .35s ease}@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.btn{border:none;border-radius:10px;padding:9px 15px;font-weight:600;font-size:13.5px;transition:.15s;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.btn-primary{background:var(--brand);color:#fff}.btn-primary:hover{background:var(--brand-d)}
.btn-primary.disabled{background:#B9C2D6;cursor:not-allowed}
.btn-ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}.btn-ghost:hover{background:var(--bg)}
.btn-mini{padding:5px 11px;font-size:12.5px;border-radius:8px;background:var(--bg);color:var(--ink)}
.btn-mini.btn-primary{background:var(--brand);color:#fff}
.btn-danger-o{background:transparent;border:1px solid var(--danger);color:var(--danger)}
.btn-up{background:var(--warn);color:#fff}
.full{width:100%;justify-content:center}
.link{background:none;border:none;color:var(--brand);font-weight:600;font-size:13px}
.link-mini{background:none;border:none;color:var(--muted);font-size:12.5px;font-weight:600;text-decoration:underline;text-underline-offset:2px}
.link-mini:hover{color:var(--brand)}
.icon-btn{background:none;border:none;color:var(--muted);width:28px;height:28px;border-radius:8px;font-size:13px}
.icon-btn:hover{background:var(--bg);color:var(--danger)}
.chip{font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:20px;display:inline-block}
.st-draft{background:#EEF0F3;color:#8892A2}.st-sent{background:var(--warn-soft);color:var(--warn)}
.st-accept{background:var(--ok-soft);color:var(--ok)}.st-decline{background:var(--danger-soft);color:var(--danger)}
.st-expire{background:#EEF0F3;color:#9AA0AC}.st-attend{background:#EAF3EC;color:#2E7D32}
.muted{color:var(--muted)}.mono{font-family:ui-monospace,monospace;font-size:12.5px}.sm2{font-size:12.5px}
.count-pill{background:var(--brand-soft);color:var(--brand);font-size:12px;font-weight:600;padding:3px 9px;border-radius:8px}
.tag-role{font-size:10.5px;color:var(--muted);background:var(--bg);padding:2px 7px;border-radius:6px;margin-inline-start:5px}
.tag-role.owner{background:var(--brand-soft);color:var(--brand)}
.seat-mini{font-size:11px;color:var(--brand);background:var(--brand-soft);padding:1px 7px;border-radius:6px;margin-inline-start:6px;font-weight:600}
.cl-shell{display:grid;grid-template-columns:250px 1fr;min-height:calc(100vh - 44px)}
.cl-side{background:var(--panel);border-inline-start:1px solid var(--line);padding:20px 14px;display:flex;flex-direction:column;gap:16px}
.cl-logo{display:flex;align-items:center;gap:9px;padding:2px 6px}
.cl-logo-mark{width:32px;height:32px;border-radius:9px;background:var(--brand);color:#fff;display:grid;place-items:center;font-size:15px}
.cl-logo-text{font-family:var(--disp);font-weight:800;font-size:16px}
.cl-host{background:var(--bg);border-radius:12px;padding:12px 14px}
.cl-host-lbl{font-size:11px;color:var(--muted)}.cl-host-name{font-family:var(--disp);font-weight:700;font-size:16px;margin-top:2px}
.cl-host-occ{font-size:12px;color:var(--brand);font-weight:600}
.cl-nav{display:flex;flex-direction:column;gap:2px;flex:1}
.cl-nav-item{display:flex;align-items:center;gap:10px;background:none;border:none;padding:10px 12px;border-radius:10px;font-size:13.5px;font-weight:500;color:var(--muted);text-align:start;transition:.12s}
.cl-nav-item:hover{background:var(--bg);color:var(--ink)}.cl-nav-item.on{background:var(--brand-soft);color:var(--brand);font-weight:700}
.cl-nav-ic{width:20px;text-align:center;opacity:.85}
.cl-user{display:flex;align-items:center;gap:10px;padding:10px;border-top:1px solid var(--line)}
.cl-avatar{width:36px;height:36px;border-radius:50%;background:var(--brand);color:#fff;display:grid;place-items:center;font-weight:700}
.cl-user-name{font-weight:600;font-size:13px}.cl-user-sub{font-size:11.5px;color:var(--muted)}
.cl-main{padding:26px 30px;overflow:auto}
.scr{max-width:900px;animation:fade .3s ease}
.scr-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:22px}
.scr-head h1{font-family:var(--disp);font-weight:800;font-size:24px}.scr-head p{color:var(--muted);font-size:13.5px;margin-top:3px}
.flash{background:var(--danger-soft);color:var(--danger);font-weight:600;font-size:13px;padding:11px 15px;border-radius:12px;margin-bottom:14px;animation:fade .2s}
/* الرصيد ثلاثي الحالة */
.bal-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px 22px;margin-bottom:18px}
.bal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.bal-title{font-family:var(--disp);font-weight:700;font-size:17px}.bal-total{font-size:13px;color:var(--muted);font-weight:500}
.bal-track{height:14px;background:var(--bg);border-radius:20px;overflow:hidden;display:flex}
.bal-seg{height:100%;transition:width .4s}
.bal-seg.conf{background:var(--ok)}.bal-seg.held{background:var(--warn)}
.bal-legend{display:flex;gap:22px;margin-top:14px;flex-wrap:wrap}
.bal-item{display:flex;align-items:center;gap:9px}
.bal-chip{width:12px;height:12px;border-radius:4px;flex-shrink:0}
.bal-chip.conf{background:var(--ok)}.bal-chip.held{background:var(--warn)}.bal-chip.avail{background:var(--bg);border:1px solid var(--line)}
.bal-item-n{font-family:var(--disp);font-weight:800;font-size:19px;line-height:1}.bal-item-l{font-size:11.5px;color:var(--muted)}
.bal-note{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line);font-size:12.5px}
.bal-note b{font-family:var(--disp)}
.bal-pending{color:var(--warn);font-weight:600}
.dash-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
.dash-stats.four{margin-bottom:20px}
.mstat{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.mstat-n{font-family:var(--disp);font-weight:800;font-size:26px;line-height:1}.mstat-l{font-size:12.5px;color:var(--muted);margin-top:5px}
.mstat.accept .mstat-n{color:var(--ok)}.mstat.sent .mstat-n{color:var(--warn)}.mstat.decline .mstat-n{color:var(--danger)}.mstat.attend .mstat-n{color:#2E7D32}.mstat.draft .mstat-n{color:var(--muted)}
.dash-two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px}
.card-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.card-head h3{font-size:15px;font-weight:700}
.mini-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--line)}.mini-row:last-child{border-bottom:none}
.mini-name{display:flex;align-items:center;gap:9px;font-size:13.5px;font-weight:500}
.av{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--brand),#6C8BFF);color:#fff;display:grid;place-items:center;font-weight:700;font-size:13px;flex-shrink:0}
.av.sm{width:26px;height:26px;font-size:12px}.av.lg{width:46px;height:46px;font-size:19px}
.toolbar{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
.input{width:100%;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13.5px;background:var(--panel);color:var(--ink);transition:.15s}
.input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px rgba(59,91,219,.12)}
.flex1{flex:1;min-width:180px}
.seg{display:inline-flex;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:3px;flex-wrap:wrap}
.seg-b{background:none;border:none;padding:6px 11px;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--muted)}.seg-b.on{background:var(--brand);color:#fff}
.table{background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden}
.tr{display:grid;grid-template-columns:1.6fr 1.2fr 1fr 1.1fr .9fr 1fr;gap:10px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)}
.tr.sc{grid-template-columns:1.4fr 1.4fr .5fr}.tr.ev{grid-template-columns:1.4fr 1.3fr .6fr .6fr 1fr}.tr.rq{grid-template-columns:1fr 2fr 1.1fr}
.tr:last-child{border-bottom:none}.tr.th{background:var(--bg);font-size:12px;font-weight:700;color:var(--muted)}
.cell-name{display:flex;align-items:center;gap:9px;font-weight:600;font-size:13.5px}
.seats{font-size:12.5px;font-weight:600}.seats.confirmed{color:var(--ok)}.seats-of{color:var(--muted);font-weight:400;font-size:11px}
.seats.offered{color:var(--warn)}
.row-actions{display:flex;gap:8px;align-items:center;justify-content:flex-end}
.empty-lite{padding:24px;text-align:center;color:var(--muted);font-size:13px}
.hold-box{display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--warn-soft);color:#9A6B1E;border-radius:11px;padding:11px 14px;font-size:12.5px;margin-bottom:12px}
.hold-box b{font-family:var(--disp)}.hold-avail{white-space:nowrap;opacity:.8}
.hold-box.bad{background:var(--danger-soft);color:var(--danger)}
/* بطاقة تفاصيل المدعو */
.gd-top{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:16px}
.gd-box{background:var(--bg);border-radius:12px;padding:12px 16px;text-align:center;min-width:78px}
.gd-box.on{background:var(--ok-soft)}.gd-box.rel{background:var(--brand-soft)}
.gd-box-n{font-family:var(--disp);font-weight:800;font-size:24px;line-height:1}
.gd-box.on .gd-box-n{color:var(--ok)}.gd-box.rel .gd-box-n{color:var(--brand)}
.gd-box-l{font-size:11px;color:var(--muted);margin-top:3px}
.gd-arrow{color:var(--muted);font-size:16px}
.gd-meta{display:flex;gap:16px;justify-content:center;font-size:12px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--line)}
.timeline{display:flex;flex-direction:column}
.tl-row{display:flex;gap:12px;padding-bottom:14px;position:relative}
.tl-row:not(:last-child)::before{content:'';position:absolute;top:14px;inset-inline-start:5px;width:2px;height:100%;background:var(--line)}
.tl-dot{width:12px;height:12px;border-radius:50%;background:var(--ok);flex-shrink:0;margin-top:3px;z-index:1}
.tl-row.pending .tl-dot{background:var(--warn)}.tl-row.bad .tl-dot{background:var(--danger)}.tl-row.good .tl-dot{background:#2E7D32}
.tl-t{font-size:13px;font-weight:600}.tl-d{font-size:11.5px;color:var(--muted);margin-top:1px}
.cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}
.inv-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px}
.inv-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
.inv-name{font-family:var(--disp);font-weight:700;font-size:16px}
.inv-stats{display:flex;gap:14px;margin-top:10px;font-size:12.5px;color:var(--muted)}.inv-stats b{color:var(--ink);font-size:15px;font-family:var(--disp)}
.tpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px}.tpl-grid.mb{margin-bottom:8px}
.tpl-card{background:var(--panel);border:2px solid var(--line);border-radius:16px;padding:14px;cursor:pointer;transition:.15s;position:relative}
.tpl-card:hover{border-color:#c7d0e6}.tpl-card.on{border-color:var(--brand)}.tpl-card.mini{cursor:default}
.tpl-preview{height:150px;border-radius:11px;background:linear-gradient(135deg,#EEF1FA,#F7EEF0);display:grid;place-items:center;color:#B4BDD2;font-family:var(--disp);font-weight:700;font-size:18px;margin-bottom:10px}
.tpl-preview.sm{height:90px;font-size:14px}.tpl-name{font-weight:700;font-size:14px}.tpl-note{font-size:12px;color:var(--muted);margin-top:2px}
.tpl-check{position:absolute;top:10px;inset-inline-start:10px;background:var(--brand);color:#fff;font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px}
.info-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:16px}
.info-row{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--line)}.info-row:last-child{border-bottom:none}
.info-l{color:var(--muted);font-size:13px}.info-v{font-weight:600;font-size:13.5px}
.up-actions{display:flex;gap:10px;margin-top:14px}
.overlay{position:fixed;inset:0;background:rgba(20,26,40,.5);display:flex;align-items:flex-start;justify-content:center;padding:5vh 16px;z-index:60;overflow:auto;animation:fade .2s}
.modal{background:var(--panel);border-radius:18px;width:100%;max-width:460px;box-shadow:0 24px 60px rgba(20,26,40,.3)}
.modal-head{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid var(--line)}
.modal-head h3{font-family:var(--disp);font-weight:800;font-size:18px}
.modal-body{padding:20px}.modal-actions{display:flex;gap:10px;margin-top:18px}
.field{margin-bottom:14px}.field label{display:block;font-size:12.5px;font-weight:600;margin-bottom:6px}
.hint{font-size:11.5px;color:var(--muted);margin-top:6px}.row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.err{background:var(--danger-soft);color:var(--danger);font-size:12.5px;font-weight:600;padding:9px 12px;border-radius:10px;margin-top:4px}
.stepper{display:flex;align-items:center;border:1px solid var(--line);border-radius:10px;overflow:hidden;width:fit-content}
.stepper button{width:38px;height:40px;background:var(--bg);border:none;font-size:18px;color:var(--brand)}
.stepper span{width:48px;text-align:center;font-weight:700;font-family:var(--disp);font-size:16px}
.toggle-row{display:flex;justify-content:space-between;align-items:center;gap:14px;background:var(--bg);border-radius:12px;padding:13px 15px;cursor:pointer;margin-top:4px}
.toggle-title{font-weight:600;font-size:13.5px}
.switch{width:44px;height:25px;border-radius:20px;background:#CBD2DE;position:relative;transition:.2s;flex-shrink:0}
.switch span{position:absolute;top:3px;inset-inline-start:3px;width:19px;height:19px;border-radius:50%;background:#fff;transition:.2s}
.switch.on{background:var(--brand)}.switch.on span{inset-inline-start:22px}
.upload{border:2px dashed var(--line);border-radius:12px;padding:24px;text-align:center;color:var(--muted);font-size:13px;background:var(--bg)}
.sent-ok{text-align:center;padding:20px}.sent-ic{width:52px;height:52px;border-radius:50%;background:var(--ok-soft);color:var(--ok);display:grid;place-items:center;font-size:26px;margin:0 auto 12px}
.ad-shell{padding:0}.ad-head{background:var(--panel);border-bottom:1px solid var(--line);padding:18px 30px 0}
.ad-head h2{font-family:var(--disp);font-weight:800;font-size:22px;margin-bottom:14px}
.tabs{display:flex;gap:4px}.tab{background:none;border:none;padding:11px 16px;font-size:14px;font-weight:600;color:var(--muted);border-bottom:2px solid transparent}
.tab.on{color:var(--brand);border-bottom-color:var(--brand)}
.ad-body{padding:26px 30px;max-width:1000px}
.between{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.between h3,.mt{font-size:16px;font-weight:700}.mt{margin:24px 0 12px}
.pkg-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.pkg-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;text-align:center}
.pkg-name{font-weight:700;font-size:15px;color:var(--muted)}
.pkg-q{font-family:var(--disp);font-weight:800;font-size:30px;margin:6px 0}.pkg-q span{font-size:15px;color:var(--muted)}
.pkg-p{color:var(--brand);font-weight:700;font-size:17px;margin-bottom:14px}
.sc-shell{min-height:calc(100vh - 44px);display:grid;place-items:center;padding:30px;background:#141A26}
.sc-card{background:var(--panel);border-radius:22px;padding:24px;width:100%;max-width:380px;text-align:center}
.sc-title{font-family:var(--disp);font-weight:800;font-size:18px;margin-bottom:16px}
.sc-frame{height:200px;border-radius:16px;background:#0F1420;position:relative;overflow:hidden;display:grid;place-items:center;margin-bottom:16px}
.sc-frame::before,.sc-frame::after{content:'';position:absolute;width:40px;height:40px;border:3px solid var(--brand)}
.sc-frame::before{top:16px;inset-inline-start:16px;border-inline-end:none;border-bottom:none;border-radius:8px 0 0 0}
.sc-frame::after{bottom:16px;inset-inline-end:16px;border-inline-start:none;border-top:none;border-radius:0 0 8px 0}
.sc-laser{position:absolute;top:0;left:10%;right:10%;height:2px;background:var(--brand);box-shadow:0 0 12px var(--brand);animation:scan 2s ease-in-out infinite}
@keyframes scan{0%,100%{top:20%}50%{top:80%}}
.sc-hint{color:#5C6B85;font-size:12.5px}
.sc-res{border-radius:14px;padding:18px;margin-bottom:16px}.sc-res.ok{background:var(--ok-soft)}.sc-res.bad{background:var(--danger-soft)}
.sc-res-ic{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;font-size:24px;margin:0 auto 8px;color:#fff}
.sc-res.ok .sc-res-ic{background:var(--ok)}.sc-res.bad .sc-res-ic{background:var(--danger)}
.sc-res-name{font-family:var(--disp);font-weight:800;font-size:18px}.sc-res-sub{font-size:12.5px;color:var(--muted);margin-top:2px}
.sc-res-count{margin-top:6px;font-weight:700;font-size:13px;color:var(--ok)}
.sc-sim{border-top:1px dashed var(--line);padding-top:14px}.sc-sim-lbl{font-size:11px;color:var(--muted);margin-bottom:10px}
.sc-sim-btn{display:flex;justify-content:space-between;align-items:center;width:100%;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin-bottom:7px;font-size:13.5px;font-weight:600}
.sc-sim-btn:hover{border-color:var(--brand)}.sc-sim-count{font-family:var(--disp);color:var(--brand)}
.gs-shell{padding:24px;display:flex;flex-direction:column;align-items:center;gap:16px}
.gs-picker{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:12px;width:100%;max-width:390px}
.gs-picker label{font-size:12.5px;color:var(--muted);white-space:nowrap}
.gs-phone{width:100%;max-width:390px;background:#E6DDD3;border-radius:26px;overflow:hidden;box-shadow:0 20px 50px rgba(20,26,40,.2);border:8px solid #1C2433}
.gs-wa-top{background:#075E54;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:11px}
.gs-wa-av{width:38px;height:38px;border-radius:50%;background:#ffffff22;display:grid;place-items:center;font-size:16px}
.gs-wa-name{font-weight:700;font-size:14px}.gs-wa-on{font-size:11px;opacity:.8}
.gs-chat{padding:16px 12px;min-height:340px;display:flex;flex-direction:column;gap:12px;background-image:radial-gradient(#00000008 1px,transparent 1px);background-size:16px 16px}
.gs-bubble{background:#fff;border-radius:14px 14px 14px 4px;padding:8px;max-width:88%;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.gs-bubble.in{align-self:flex-start;text-align:center;padding:16px;border-radius:14px 14px 4px 14px}
.gs-bubble.in.decline{background:#fff;color:var(--muted);font-size:13px;padding:14px}
.gs-bubble.in.choose{text-align:start;background:#F7FAFF}
.gs-inv-card{border-radius:10px;overflow:hidden;border:1px solid var(--line)}
.gs-inv-img{height:120px;background:linear-gradient(135deg,#D9C7A3,#F0E6D2);display:grid;place-items:center;color:#A08C63;font-family:var(--disp);font-weight:700}
.gs-inv-body{padding:12px}
.gs-inv-occ{font-family:var(--disp);font-weight:800;font-size:17px;color:#1C2433}
.gs-inv-host{color:var(--brand);font-weight:600;font-size:13px;margin-bottom:8px}
.gs-inv-hi{font-weight:600;font-size:13.5px}.gs-inv-txt{font-size:12.5px;color:#4A5568;margin:3px 0 8px}
.gs-inv-by{font-size:11.5px;color:var(--muted);border-top:1px solid var(--line);padding-top:7px}
.gs-actions{display:flex;gap:7px;margin-top:8px}
.gs-btn{flex:1;border:none;border-radius:9px;padding:10px;font-weight:700;font-size:13px}
.gs-btn.accept{background:var(--ok-soft);color:var(--ok)}.gs-btn.accept:hover{background:#d4f0e6}
.gs-btn.decline{background:var(--danger-soft);color:var(--danger)}.gs-btn.decline:hover{background:#fbdde0}
.gs-choose-q{font-weight:700;font-size:14px;margin-bottom:12px}
.gs-choose-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(42px,1fr));gap:7px;margin-bottom:14px}
.gs-num{aspect-ratio:1;border:1.5px solid var(--line);background:#fff;border-radius:10px;font-family:var(--disp);font-weight:700;font-size:16px;color:var(--ink)}
.gs-num.on{background:var(--brand);color:#fff;border-color:var(--brand)}
.gs-confirm{width:100%;background:var(--ok);color:#fff;border:none;border-radius:10px;padding:11px;font-weight:700;font-size:13.5px}
.gs-qr-title{color:var(--ok);font-weight:700;font-size:14px;margin-bottom:12px}
.gs-qr-note{font-size:12px;color:var(--muted);margin-top:10px}.gs-qr-count{font-size:12px;font-weight:700;color:var(--brand);margin-top:3px}
.gs-note{align-self:center;background:#00000010;color:#4A5568;font-size:11.5px;padding:7px 12px;border-radius:8px;text-align:center}
.fqr{display:grid;gap:2px;width:150px;margin:0 auto;padding:10px;background:#fff;border:1px solid var(--line);border-radius:10px}
.fqr span{aspect-ratio:1;background:transparent;border-radius:1px}.fqr span.on{background:#1C2433}
@media(max-width:820px){.cl-shell{grid-template-columns:1fr}.cl-side{flex-direction:row;flex-wrap:wrap;align-items:center;gap:10px}
.cl-nav{flex-direction:row;flex-wrap:wrap}.cl-host,.cl-user{display:none}
.dash-stats,.dash-two,.row2,.pkg-grid{grid-template-columns:1fr 1fr}.cl-main{padding:20px}}
`}</style>);
}
