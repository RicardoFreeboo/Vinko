"use client";
import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { capture } from "@/lib/analytics";
import { VMark } from "@/components/Logo";
import { t } from "@/lib/i18n";

// RewardedSlot (§4.2): UNA abstracción con cascada de tres proveedores.
//  1. Patrocinador directo (vídeo) — cuando exista, prioridad siempre.
//  2. Programático web (Google Ad Manager rewarded) — cuando haya cuenta GAM.
//  3. House ad — SIEMPRE hay relleno, y la recompensa se entrega igual.
//
// AVISO DE POLÍTICA: aquí NO se puede poner AdSense. Las políticas de AdSense
// prohíben incentivar la visualización de anuncios (recompensar por verlos) y
// hacerlo expone la cuenta a suspensión. El rewarded monetizado sólo es legal
// vía Google Ad Manager. Mientras no exista, se muestra un creativo de casa.
//
// Regla innegociable: crédito solo con finalización verificada, y NUNCA se
// castiga al usuario por un fallo de inventario. Dos fallos → el opt-in se
// esconde el resto de la sesión. El marcador jamás se toca desde anuncios.
export type SlotId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6";

type Granted = { granted: number; reward?: string; value?: number };

let sessionFails = 0; // dos fallos → fuera toda la sesión (§4.2)

const CREATIVOS = [
  { emoji: "🤝", key: "invite" },
  { emoji: "✏️", key: "create" },
  { emoji: "🔥", key: "streak" },
] as const;

export function RewardedSlot({
  slot,
  cta,
  note,
  onGranted,
  onError,
}: {
  slot: SlotId;
  cta: string;
  note?: string;
  onGranted: (g: Granted) => void;
  onError?: (code: string) => void;
}) {
  const [state, setState] = useState<"idle" | "watching" | "hidden">("idle");
  const [left, setLeft] = useState(3);
  const [creativo] = useState(() => CREATIVOS[Math.floor(Date.now() / 1000) % CREATIVOS.length]);
  const started = useRef(false);

  if (state === "hidden" || sessionFails >= 2) return null;

  async function watch() {
    if (started.current) return;
    started.current = true;
    capture("ad_opt_in", { is_seed: false, slot });
    setState("watching");
    // Cascada: sin patrocinador ni Ad Manager configurados → house ad, que ahora
    // se VE en pantalla (antes era una cuenta atrás en blanco: parecía roto).
    capture("ad_started", { is_seed: false, slot, provider: "house" });
    for (let s = 3; s > 0; s--) {
      setLeft(s);
      await new Promise((r) => setTimeout(r, 1000));
    }
    capture("ad_completed", { is_seed: false, slot, provider: "house" });
    setState("idle");
    started.current = false;

    const sb = supabaseBrowser();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!sb || !url) { fail("no_backend"); return; }
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) { fail("no_auth"); return; }
    try {
      const res = await fetch(`${url}/functions/v1/rewards-claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ impression_id: crypto.randomUUID(), slot }),
      });
      const j = (await res.json().catch(() => ({}))) as Granted & { error?: string };
      if (res.ok && (j.granted ?? 0) > 0) {
        capture("ad_reward_granted", {
          is_seed: false, slot, reward_type: j.reward ?? "", fallback: true,
        });
        onGranted(j);
      } else {
        fail(j.error ?? "unknown");
      }
    } catch {
      fail("network");
    }
  }

  function fail(code: string) {
    capture("ad_failed", { is_seed: false, slot, reason: code });
    if (code.includes("VINKO_AD_CAP")) {
      setState("hidden"); // tope alcanzado: no volver a ofrecer hoy
    } else {
      sessionFails += 1;
      if (sessionFails >= 2) setState("hidden");
    }
    onError?.(code);
  }

  return (
    <>
      {state === "watching" && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-5 bg-[var(--ink)]/97 px-8 backdrop-blur">
          <span className="mono rounded-full border border-[var(--muted2)]/50 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--muted2)]">
            {t("ad.house")}
          </span>
          <VMark size={56} />
          <div className="flex flex-col items-center gap-1.5 text-center">
            <span className="text-4xl leading-none">{creativo.emoji}</span>
            <p className="text-[19px] font-black text-[var(--cream)]">{t(`ad.house.${creativo.key}.title`)}</p>
            <p className="text-[13px] text-[var(--muted)]">{t(`ad.house.${creativo.key}.sub`)}</p>
          </div>
          <div className="h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-[var(--ink3)]">
            <div className="h-full rounded-full bg-[var(--gold)] transition-[width] duration-1000 ease-linear"
              style={{ width: `${((3 - left + 1) / 3) * 100}%` }} />
          </div>
          <p className="mono text-[12px] text-[var(--muted)]">{t("ad.watching", { s: String(left) })}</p>
        </div>
      )}

      <button
        onClick={watch}
        disabled={state === "watching"}
        className="flex w-full flex-col items-center gap-0.5 rounded-[14px] border border-[var(--gold)] px-4 py-3 text-center disabled:opacity-80"
      >
        <span className="text-[14px] font-bold text-[var(--gold)]">
          {state === "watching" ? t("ad.watching", { s: String(left) }) : cta}
        </span>
        {note && <span className="text-[11px] text-[var(--muted)]">{note}</span>}
      </button>
    </>
  );
}
