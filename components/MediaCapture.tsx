"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

// Sube el vídeo/foto/voz de la porra (como el apk4): grabar con la cámara,
// grabar voz, o subir archivo del teléfono. Va a Supabase Storage y devuelve la
// URL + tipo. (Moderación antes de hacerse público: queda pendiente de la cola.)
type Kind = "video" | "image" | "audio";
const MAX_MS = 15000;

export function MediaCapture({ userId, onMedia, extra }: {
  userId: string; onMedia: (url: string | null, kind: Kind | null) => void;
  extra?: ReactNode; // botón adicional en la rejilla (p. ej. «Dictar»)
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
  const seq = useRef(0);

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
    const mine = ++seq.current; // si luego se quita o se graba otro, esta subida ya no cuenta
    setBusy(true); setErr(null);
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extOf(blob.type, kind)}`;
    const { error } = await sb.storage.from("porra-media").upload(path, blob, { contentType: blob.type, upsert: false });
    if (mine !== seq.current) return;
    if (error) { setBusy(false); setErr(t("media.err")); return; }
    const { data } = sb.storage.from("porra-media").getPublicUrl(path);
    setBusy(false);
    onMedia(data.publicUrl, kind);
    // Miniatura JPG al lado del vídeo (<ruta>.thumb.jpg, ver lib/thumb.ts) EN
    // SEGUNDO PLANO: no retrasa «Crear». Si falla o sale negra, se ve la portada.
    if (kind === "video") {
      void videoThumb(blob).then((thumb) => thumb
        ? sb.storage.from("porra-media").upload(path.replace(/\.[^.]+$/, ".thumb.jpg"), thumb, { contentType: "image/jpeg", upsert: false })
        : null).catch(() => null);
    }
  }

  function clear() { seq.current++; setBusy(false); setPreview(null); onMedia(null, null); setErr(null); }

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
      <div className={extra ? "grid grid-cols-2 gap-2" : "grid grid-cols-3 gap-2"}>
        <Btn onClick={() => startRec("video")} icon="📹" label={t("media.recVideo")} />
        <Btn onClick={() => startRec("audio")} icon="🎤" label={t("media.recVoice")} />
        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-[10px] border border-[var(--line)] px-2 py-3 text-center">
          <span className="text-xl leading-none">📁</span>
          <span className="text-[11px] font-bold text-[var(--cream)]">{t("media.upload")}</span>
          <input type="file" accept="video/*,image/*,audio/*" onChange={onFile} className="hidden" />
        </label>
        {extra}
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

// Extensión según el tipo real (antes todo vídeo se guardaba como .webm, también
// el .mov/.mp4 del iPhone).
function extOf(type: string, kind: Kind): string {
  const t0 = type.split(";")[0];
  if (kind === "image") return t0 === "image/png" ? "png" : t0 === "image/webp" ? "webp" : "jpg";
  if (kind === "audio") return t0 === "audio/mp4" ? "m4a" : t0 === "audio/mpeg" ? "mp3" : "webm";
  return t0 === "video/mp4" ? "mp4" : t0 === "video/quicktime" ? "mov" : "webm";
}

// Saca un fotograma (~1 s, o la mitad si es más corto) y lo devuelve como JPG
// 360x640 recortado al centro. El <video> se mete en la página (1 px, casi
// transparente) porque iOS no carga fotogramas de un vídeo suelto ni deja
// reproducir uno "invisible". Se arranca en loadedmetadata (iOS no pasa de ahí
// sin un seek). Lo grabado con MediaRecorder puede no traer duración (Infinity):
// entonces se reproduce en silencio hasta ~0,8 s o hasta el final. Descarta
// fotogramas casi negros. Máximo 5 s; si no, null.
function videoThumb(blob: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    let done = false;
    const finish = (b: Blob | null) => {
      if (done) return;
      done = true;
      try { v.pause(); } catch { /* noop */ }
      v.remove();
      URL.revokeObjectURL(url);
      resolve(b);
    };
    const grab = () => {
      if (done) return;
      if (v.readyState < 2) { v.addEventListener("loadeddata", grab, { once: true }); return; }
      try {
        const W = 360, H = 640;
        const c = document.createElement("canvas");
        c.width = W; c.height = H;
        const ctx = c.getContext("2d");
        if (!ctx || !v.videoWidth) return finish(null);
        const s = Math.max(W / v.videoWidth, H / v.videoHeight);
        const w = v.videoWidth * s, h = v.videoHeight * s;
        ctx.drawImage(v, (W - w) / 2, (H - h) / 2, w, h);
        // luminosidad media muestreando 1 de cada 100 píxeles (RGBA = 4 bytes)
        const px = ctx.getImageData(0, 0, W, H).data;
        let luz = 0, n = 0;
        for (let i = 0; i < px.length; i += 400) { luz += (px[i] + px[i + 1] + px[i + 2]) / 3; n++; }
        if (luz / n < 14) return finish(null);
        c.toBlob((b) => finish(b), "image/jpeg", 0.8);
      } catch { finish(null); }
    };
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.setAttribute("playsinline", "");
    v.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none";
    v.addEventListener("error", () => finish(null), { once: true });
    v.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(v.duration) && v.duration > 0) {
        v.addEventListener("seeked", grab, { once: true });
        v.currentTime = Math.min(1, v.duration / 2);
      } else {
        const onTime = () => { if (v.currentTime >= 0.8) { v.removeEventListener("timeupdate", onTime); grab(); } };
        v.addEventListener("timeupdate", onTime);
        v.addEventListener("ended", grab, { once: true });
        v.play().catch(grab);
      }
    }, { once: true });
    setTimeout(() => { if (v.readyState >= 2) grab(); else finish(null); }, 5000);
    document.body.appendChild(v);
    v.src = url;
  });
}
