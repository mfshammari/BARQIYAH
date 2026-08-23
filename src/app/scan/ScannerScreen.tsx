'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { verifyScan, type ScanResult } from './actions';
import { formatNumber } from '@/lib/format';

type CameraState = 'idle' | 'starting' | 'running' | 'denied' | 'unsupported';

const RESCAN_COOLDOWN_MS = 2500;

export function ScannerScreen({
  eventLabel, scannerLabel, logoutAction,
}: {
  eventLabel: string;
  scannerLabel: string;
  logoutAction: () => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopReaderRef = useRef<(() => void) | null>(null);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);

  const [camera, setCamera] = useState<CameraState>('idle');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [manual, setManual] = useState('');
  const [history, setHistory] = useState<ScanResult[]>([]);
  const [pending, startTransition] = useTransition();

  const handleCode = useCallback((code: string) => {
    const now = Date.now();
    const last = lastCodeRef.current;
    if (last && last.code === code && now - last.at < RESCAN_COOLDOWN_MS) return;
    lastCodeRef.current = { code, at: now };

    startTransition(async () => {
      const res = await verifyScan(code);
      setResult(res);
      setHistory((prev) => [res, ...prev].slice(0, 8));
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(res.ok ? 60 : [40, 60, 40]);
      }
    });
  }, []);

  const stopCamera = useCallback(() => {
    stopReaderRef.current?.();
    stopReaderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamera('idle');
  }, []);

  const startCamera = useCallback(async () => {
    setCamera('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setCamera('running');

      // المسار السريع: BarcodeDetector المدمج في المتصفح
      const Detector = (window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
        };
      }).BarcodeDetector;

      if (Detector) {
        const detector = new Detector({ formats: ['qr_code'] });
        let active = true;
        stopReaderRef.current = () => { active = false; };

        const tick = async () => {
          if (!active || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0 && codes[0].rawValue) handleCode(codes[0].rawValue);
          } catch {
            /* إطار غير قابل للقراءة — نتجاهله */
          }
          if (active) requestAnimationFrame(() => { void tick(); });
        };
        void tick();
        return;
      }

      // احتياطي: ZXing لمتصفحات لا تدعم BarcodeDetector (سفاري وغيره)
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromVideoElement(video, (decoded) => {
        if (decoded) handleCode(decoded.getText());
      });
      stopReaderRef.current = () => controls.stop();
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      setCamera(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unsupported');
    }
  }, [handleCode]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <div className="min-h-screen bg-brand text-white flex flex-col" data-layer="soft">
      <header className="px-4 py-3 flex items-center justify-between border-b border-white/10">
        <div className="min-w-0">
          <div className="font-cerem text-lg leading-tight">برقية</div>
          <div className="text-[11.5px] text-white/60 truncate">{eventLabel} · {scannerLabel}</div>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="text-[12.5px] text-white/70 hover:text-white">خروج</button>
        </form>
      </header>

      <div className="flex-1 flex flex-col items-center justify-start px-4 py-5 gap-4">
        <div className="w-full max-w-sm aspect-square rounded-2xl overflow-hidden bg-black/40 relative border border-white/15">
          <video
            ref={videoRef}
            playsInline muted
            className={`w-full h-full object-cover ${camera === 'running' ? '' : 'opacity-0'}`}
          />

          {camera === 'running' ? (
            <div className="absolute inset-8 border-2 border-gold-soft/70 rounded-xl pointer-events-none" />
          ) : null}

          {camera !== 'running' ? (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              {camera === 'denied' ? (
                <div>
                  <p className="text-[14px] font-semibold">تم رفض إذن الكاميرا</p>
                  <p className="text-[12.5px] text-white/70 mt-1.5">
                    فعّل إذن الكاميرا من إعدادات المتصفح، أو أدخل الرمز يدوياً بالأسفل.
                  </p>
                </div>
              ) : camera === 'unsupported' ? (
                <div>
                  <p className="text-[14px] font-semibold">الكاميرا غير متاحة</p>
                  <p className="text-[12.5px] text-white/70 mt-1.5">
                    استخدم الإدخال اليدوي بالأسفل. (تتطلب الكاميرا اتصالاً آمناً HTTPS)
                  </p>
                </div>
              ) : camera === 'starting' ? (
                <p className="text-[13px] text-white/70">جارٍ تشغيل الكاميرا…</p>
              ) : (
                <button type="button" onClick={startCamera} className="btn-gold">
                  تشغيل الكاميرا
                </button>
              )}
            </div>
          ) : null}
        </div>

        {camera === 'running' ? (
          <button type="button" onClick={stopCamera} className="text-[12.5px] text-white/60 hover:text-white">
            إيقاف الكاميرا
          </button>
        ) : null}

        {pending ? (
          <div className="w-full max-w-sm rounded-xl bg-white/10 px-4 py-3 text-center text-[13px]">
            جارٍ التحقق…
          </div>
        ) : result ? (
          <ResultCard result={result} onDismiss={() => setResult(null)} />
        ) : null}

        <form
          className="w-full max-w-sm flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!manual.trim()) return;
            handleCode(manual.trim());
            setManual('');
          }}
        >
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            dir="ltr"
            placeholder="أو ألصق الرمز يدوياً"
            className="flex-1 rounded-xl bg-white/10 border border-white/15 px-3.5 py-2.5
                       text-[13px] text-white placeholder:text-white/40 outline-none
                       focus:border-gold-soft text-left"
          />
          <button type="submit" className="btn-gold">تحقق</button>
        </form>

        {history.length > 1 ? (
          <div className="w-full max-w-sm">
            <div className="text-[12px] text-white/50 mb-2">آخر عمليات المسح</div>
            <div className="space-y-1.5">
              {history.slice(1).map((h, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-3 py-2 text-[12.5px] flex items-center justify-between gap-2 ${
                    h.ok ? 'bg-white/10' : 'bg-danger/25'
                  }`}
                >
                  <span className="truncate">{h.name ?? 'رمز غير معروف'}</span>
                  <span className="text-white/60 shrink-0">{h.ok ? 'دخل' : 'مرفوض'}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ResultCard({ result, onDismiss }: { result: ScanResult; onDismiss: () => void }) {
  const tone = result.ok
    ? 'bg-ok-soft text-ok'
    : result.reason === 'CODE_EXHAUSTED'
      ? 'bg-warn-soft text-warn'
      : 'bg-danger-soft text-danger';

  return (
    <div className={`w-full max-w-sm rounded-2xl px-4 py-5 text-center shadow-pop ${tone}`}>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onDismiss}
          aria-label="إغلاق"
          className="text-lg leading-none opacity-60 hover:opacity-100"
        >
          ×
        </button>
      </div>

      {/* علامة كبيرة تُقرأ من بعيد على الباب */}
      <div
        aria-hidden
        className="mx-auto grid h-24 w-24 place-items-center rounded-2xl border-2 border-current text-[44px] leading-none"
      >
        {result.ok ? '✓' : '✕'}
      </div>

      <div className="mt-4 font-ui text-lg font-bold leading-tight">
        {result.name ?? result.message}
      </div>

      <div className="mt-1 text-[13px] num">
        {result.ok && result.seats != null
          ? `مسح ${formatNumber(result.scansUsed ?? 0)} من ${formatNumber(result.seats)} مقاعد · حضر`
          : result.message}
      </div>

      {result.inviter ? (
        <div className="mt-1 text-[12px] opacity-70">الداعي: {result.inviter}</div>
      ) : null}
    </div>
  );
}
