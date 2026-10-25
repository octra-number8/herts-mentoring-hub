"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { checkInByCode } from "../../actions";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type Log = { id: number; ok: boolean; text: string };

/**
 * Scans attendees' personal QR codes with the camera where the browser supports
 * the BarcodeDetector API, with manual code entry as a fallback.
 */
export function Scanner({ eventId }: { eventId: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const busy = useRef(false);
  const recent = useRef(new Map<string, number>());
  const [supported, setSupported] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState("");
  const [log, setLog] = useState<Log[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSupported(typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia), 0);
    return () => clearTimeout(t);
  }, []);

  const submit = useCallback(async (value: string) => {
    const fd = new FormData();
    fd.set("event_id", eventId);
    fd.set("code", value);
    const res = await checkInByCode({}, fd);
    setLog((l) => [{ id: Date.now() + Math.random(), ok: !!res.ok, text: res.ok ? res.message ?? "Checked in." : res.error ?? "Not recognised." }, ...l].slice(0, 20));
    return !!res.ok;
  }, [eventId]);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setScanning(false);
  }, []);

  useEffect(() => stop, [stop]);

  async function start() {
    setCameraError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play();
      }
      setScanning(true);
      const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      const detector = new Ctor({ formats: ["qr_code"] });
      const tick = async () => {
        if (!stream.current || !video.current) return;
        if (!busy.current && video.current.readyState >= 2) {
          try {
            const found = await detector.detect(video.current);
            const value = found[0]?.rawValue;
            const last = value ? recent.current.get(value) ?? 0 : 0;
            if (value && Date.now() - last > 5000) {
              recent.current.set(value, Date.now());
              busy.current = true;
              await submit(value);
              busy.current = false;
            }
          } catch {
            busy.current = false;
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      setCameraError("The camera could not be started. Check the browser's camera permission, or type the code below.");
      stop();
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section aria-labelledby="camera-title" className="space-y-3 rounded-lg border border-line bg-surface p-5">
        <h2 id="camera-title" className="text-[15px] font-semibold text-navy-900">Camera</h2>
        {supported === false && <p className="text-sm text-muted">This browser cannot read QR codes directly. Type the code shown under the attendee&apos;s QR code instead.</p>}
        {supported && (
          <>
            <video ref={video} muted playsInline className={scanning ? "aspect-video w-full rounded-md bg-navy-950 object-cover" : "hidden"} aria-label="Camera preview" />
            {scanning ? (
              <button type="button" className={buttonClass("secondary")} onClick={stop}>Stop camera</button>
            ) : (
              <button type="button" className={buttonClass("primary")} onClick={start}>Start scanning</button>
            )}
          </>
        )}
        {cameraError && <p role="alert" className="text-sm text-danger-700">{cameraError}</p>}
      </section>

      <section aria-labelledby="manual-title" className="space-y-3 rounded-lg border border-line bg-surface p-5">
        <h2 id="manual-title" className="text-[15px] font-semibold text-navy-900">Enter a code</h2>
        <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
          e.preventDefault();
          if (code.trim() && await submit(code.trim())) setCode("");
        }}>
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm font-medium">
            Personal check-in code
            <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false}
              className="block w-full rounded-md border border-line bg-white px-3 py-2 font-mono text-[15px] focus:border-navy-600 focus:outline-none focus:ring-2 focus:ring-navy-100" />
          </label>
          <button type="submit" className={buttonClass("primary")}>Check in</button>
        </form>
        <h3 className="pt-2 text-sm font-semibold text-navy-900">This session</h3>
        <ul aria-live="polite" className="space-y-1.5 text-sm">
          {log.length === 0 && <li className="text-muted">Nobody checked in from this screen yet.</li>}
          {log.map((l) => (
            <li key={l.id} className={l.ok ? "rounded bg-success-50 px-3 py-1.5 text-success-700" : "rounded bg-danger-50 px-3 py-1.5 text-danger-700"}>
              {l.ok ? "Checked in: " : "Not checked in: "}{l.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
