"use client";
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";

// Reproductor del anuncio recompensado: vídeo a pantalla completa, cuenta atrás
// y CTA del patrocinador — igual que en los juegos.
// La recompensa se concede SOLO al terminar (onDone). Si lo cierra antes, no
// hay premio. El crédito real lo da siempre el servidor, no este componente.
export type Creative = {
  kind: "sponsor" | "house";
  video_url: string;
  title: string;
  cta: string;
  cta_url: string;
  seconds: number;
};

export function RewardedVideo({ creative, onDone, onCancel }: {
  creative: Creative; onDone: () => void; onCancel: () => void;
}) {
  const [left, setLeft] = useState(Math.max(3, creative.seconds || 5));
  const video = useRef<HTMLVideoElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const id = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(id);
          if (!done.current) { done.current = true; onDone(); }
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      {/* cabecera: etiqueta honesta + cerrar (sin premio) */}
      <div className="flex items-center justify-between px-4 pt-4">
        <span className="mono rounded-full bg-black/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/70 backdrop-blur">
          {creative.kind === "sponsor" ? t("ad.sponsored") : t("ad.house")}
        </span>
        <button onClick={onCancel} aria-label="Cerrar"
          className="grid h-9 w-9 place-items-center rounded-full bg-black/50 text-lg text-white/80 backdrop-blur">
          ✕
        </button>
      </div>

      {/* creativo */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {creative.video_url ? (
          <video ref={video} src={creative.video_url} autoPlay muted playsInline loop
            className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-[var(--ink2)] text-6xl">🎬</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/40" />

        {/* contador estilo rewarded */}
        <span className="absolute right-4 top-2 grid h-11 w-11 place-items-center rounded-full bg-black/65 text-[15px] font-black text-white backdrop-blur">
          {left > 0 ? left : "✓"}
        </span>

        {/* pie: título y CTA del patrocinador */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-5">
          {creative.title && (
            <p className="text-[18px] font-black text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.8)]">{creative.title}</p>
          )}
          {creative.cta && creative.cta_url && (
            <a href={creative.cta_url} target="_blank" rel="noopener noreferrer sponsored"
              className="flex items-center justify-center rounded-[12px] bg-[var(--gold)] py-3 text-[14px] font-black text-[var(--ink)]">
              {creative.cta}
            </a>
          )}
          <p className="mono text-center text-[11px] text-white/60">
            {left > 0 ? t("ad.watching", { s: String(left) }) : t("ad.rewardReady")}
          </p>
        </div>
      </div>
    </div>
  );
}
