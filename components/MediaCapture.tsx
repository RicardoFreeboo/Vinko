"use client";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

// Sube el vídeo/foto/voz de la porra (como el apk4): grabar con la cámara,
// grabar voz, o subir archivo del teléfono. Va a Supabase Storage y devuelve la
// URL + tipo. (Moderación antes de hacerse público: queda pendiente de la cola.)
type Kind = "video" | "image" | "audio";
const MAX_MS = 15000;

export function MediaCapture({ userId, onMedia }: {
  userId: string; onMedia: (url: string | null, kind: Kind | null) => void;
}) {
  const [rec, setRec] = useState<null | "video" | "audio">(null);
  const [left, setLeft] = useState(15);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; kind: Kind } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveVideo = useRef<HTMLVideoElement>(null);

  // Enseña la cámara EN VIVO mientras grabas (no a ciegas): engancha el stream al
  // <video> de previsualización en cuanto aparece.
  useEffect(() => {
    if (rec === "video" && liveVideo.current && stream.current) {
      liveVideo.current.srcObject = stream.current;
    }
  }, [rec]);

  function pickMime(video: boolean): string {
    const c = video
      ? ["video/webm;codecs=vp9", "video/webm", "video/mp4"]
      : ["audio/webm", "audio/mp4", "audio/mpeg"];
    return c.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
  }

  async function startRec(kind: "video" | "audio") {
    setErr(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia(kind === "video" ? { video: { facingMode: "user" }, audio: true } : { audio: true });
      stream.current = s;
      const mime = pickMime(kind === "video");
      const mr = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunks.current, { type: mime || (kind === "video" ? "video/webm" : "audio/webm") });
        setPreview({ url: URL.createObjectURL(blob), kind });
        void upload(blob, kind);
        s.getTracks().forEach((track) => track.stop());
      };
      recorder.current = mr; mr.start();
      setRec(kind); setLeft(15);
      timer.current = setInterval(() => setLeft((v) => { if (v <= 1) { stop(); return 0; } return v - 1; }), 1000);
      setTimeout(() => stop(), MAX_MS);
    } catch { setErr(t("media.noPerm")); }
  }
  function stop() {
    if (timer.current) clearInterval(timer.current);
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    setRec(null);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const kind: Kind = f.type.startsWith("video") ? "video" : f.type.startsWith("audio") ? "audio" : "image";
    setPreview({ url: URL.createObjectURL(f), kind });
    await upload(f, kind);
  }

  async function upload(blob: Blob, kind: Kind) {
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true); setErr(null);
    const ext = kind === "image" ? "jpg" : kind === "audio" ? "webm" : "webm";
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage.from("porra-media").upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) { setBusy(false); setErr(t("media.err")); return; }
    const { data } = sb.storage.from("porra-media").getPublicUrl(path);
    setBusy(false);
    onMedia(data.publicUrl, kind);
  }

  function clear() { setPreview(null); onMedia(null, null); setErr(null); }

  if (preview) {
    return (
      <div className="rounded-[12px] border border-[var(--win)] bg-[var(--ink2)] p-3">
        {preview.kind === "video" && <video src={preview.url} controls playsInline className="w-full rounded-[8px]" />}
        {preview.kind === "image" && <img src={preview.url} alt="" className="w-full rounded-[8px]" />}
        {preview.kind === "audio" && <audio src={preview.url} controls className="w-full" />}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[12px] font-bold text-[var(--win)]">{busy ? t("media.uploading") : t("media.ready")}</span>
          <button onClick={clear} className="text-[12px] font-bold text-[var(--muted)]">{t("media.remove")}</button>
        </div>
        {err && <p className="mt-1 text-xs text-[var(--red)]">{err}</p>}
      </div>
    );
  }

  // GRABANDO: se ve la cámara en directo (o el micro pulsante), con el punto
  // rojo y la cuenta atrás encima, y el botón de parar.
  if (rec) {
    return (
      <div className="rounded-[12px] border-2 border-[var(--red)] bg-black p-2">
        {rec === "video" ? (
          <div className="relative overflow-hidden rounded-[10px] bg-black">
            <video ref={liveVideo} autoPlay muted playsInline
              style={{ transform: "scaleX(-1)" }}
              className="mx-auto max-h-[52vh] w-full object-cover" />
            <span className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-black text-white backdrop-blur">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--red)]" /> {t("media.live")} · {left}s
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-7">
            <span className="grid h-16 w-16 animate-pulse place-items-center rounded-full bg-[var(--red)]/20 text-3xl">🎤</span>
            <span className="text-[13px] font-black text-white">{t("media.recording", { s: String(left) })}</span>
          </div>
        )}
        <button onClick={stop} className="mt-2 flex w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--red)] px-3 py-3 text-sm font-black text-white">
          ⏹ {t("media.stop")}
        </button>
        {err && <p className="mt-1 text-xs text-[var(--red)]">{err}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-[12px] border border-dashed border-[var(--line)] bg-[var(--ink2)] p-3">
      <div className="grid grid-cols-3 gap-2">
        <Btn onClick={() => startRec("video")} icon="📹" label={t("media.recVideo")} />
        <Btn onClick={() => startRec("audio")} icon="🎤" label={t("media.recVoice")} />
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-[10px] border border-[var(--line)] px-2 py-3 text-center">
          <span className="text-xl leading-none">📁</span>
          <span className="text-[11px] font-bold text-[var(--cream)]">{t("media.upload")}</span>
          <input type="file" accept="video/*,image/*,audio/*" onChange={onFile} className="hidden" />
        </label>
      </div>
      {err && <p className="mt-2 text-xs text-[var(--red)]">{err}</p>}
      <p className="mt-2 text-[10px] text-[var(--muted2)]">{t("media.note")}</p>
    </div>
  );
}

function Btn({ onClick, icon, label }: { onClick: () => void; icon: string; label: string }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 rounded-[10px] border border-[var(--line)] px-2 py-3 text-center">
      <span className="text-xl leading-none">{icon}</span>
      <span className="text-[11px] font-bold text-[var(--cream)]">{label}</span>
    </button>
  );
}
