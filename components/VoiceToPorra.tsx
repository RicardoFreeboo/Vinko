"use client";
import { useRef, useState } from "react";
import { t } from "@/lib/i18n";

// Dicta la porra: el navegador transcribe (Web Speech API, gratis) y Haiku
// rellena pregunta + opciones. Con la nota que pediste ("di qué te apuestas y
// qué opciones"). Si el navegador no soporta voz, se escribe a mano o se sube
// audio en el campo de media.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function VoiceToPorra({ onFilled }: { onFilled: (question: string, options: string[]) => void }) {
  const [state, setState] = useState<"idle" | "listening" | "thinking">("idle");
  const [transcript, setTranscript] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<any>(null);
  const finalText = useRef("");
  // OJO: no se puede leer `state` dentro de onend/onerror — el closure lo captura
  // congelado en "idle" y finish() no se llamaba nunca (la voz no rellenaba nada).
  const listening = useRef(false);

  const SR = typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

  function start() {
    setErr(null);
    if (!SR) { setErr(t("voice.noSupport")); return; }
    finalText.current = ""; setTranscript("");
    const r = new SR();
    r.lang = "es-ES"; r.continuous = true; r.interimResults = true;
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText.current += txt + " "; else interim += txt;
      }
      setTranscript((finalText.current + interim).trim());
    };
    r.onerror = () => { listening.current = false; setErr(t("voice.err")); setState("idle"); };
    r.onend = () => {
      if (!listening.current) return;
      listening.current = false;
      void finish();
    };
    rec.current = r;
    listening.current = true;
    setState("listening");
    r.start();
  }

  function stop() { if (rec.current) rec.current.stop(); }

  async function finish() {
    const text = finalText.current.trim() || transcript.trim();
    if (text.length < 4) { setState("idle"); setErr(t("voice.short")); return; }
    setState("thinking");
    try {
      const res = await fetch("/api/voice-porra", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.pregunta) {
        onFilled(j.pregunta, j.opciones ?? ["Sí", "No"]);
        setState("idle"); setTranscript("");
      } else {
        setErr(t("voice.invalid")); setState("idle");
      }
    } catch { setErr(t("voice.err")); setState("idle"); }
  }

  return (
    <div className="rounded-[14px] border border-[var(--gold)]/50 bg-[var(--gold)]/5 p-3">
      {state === "idle" && (
        <>
          <button onClick={start} className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--gold)] px-3 py-3 text-[15px] font-black text-[var(--ink)]">
            🎤 {t("voice.cta")}
          </button>
          <p className="mt-2 text-center text-[11px] leading-snug text-[var(--muted)]">{t("voice.note")}</p>
        </>
      )}
      {state === "listening" && (
        <>
          <button onClick={stop} className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--red)] px-3 py-3 text-[15px] font-black text-white">
            ⏺ {t("voice.stop")}
          </button>
          <p className="mt-2 text-center text-[12px] text-[var(--cream)]">{transcript || t("voice.speaking")}</p>
        </>
      )}
      {state === "thinking" && <p className="py-3 text-center text-sm font-bold text-[var(--gold)]">{t("voice.thinking")}</p>}
      {err && <p className="mt-2 text-center text-xs text-[var(--red)]">{err}</p>}
    </div>
  );
}
