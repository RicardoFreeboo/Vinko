"use client";
import { useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { capture } from "@/lib/analytics";
import { t } from "@/lib/i18n";

// RewardedSlot (§4.2): UNA abstracción con cascada de tres proveedores.
//  1. Patrocinador directo (vídeo Bunny) — cuando exista, prioridad siempre.
//  2. Programático web — se activa por remote config al superar el umbral.
//  3. House ad — SIEMPRE hay relleno, y la recompensa se entrega igual.
// Regla innegociable: crédito solo con finalización verificada, y NUNCA se
// castiga al usuario por un fallo de inventario. Dos fallos → el opt-in se
// esconde el resto de la sesión. El marcador jamás se toca desde anuncios.
export type SlotId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6";

type Granted = { granted: number; reward?: string; value?: number };

let sessionFails = 0; // dos fallos → fuera toda la sesión (§4.2)

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
  const started = useRef(false);

  if (state === "hidden" || sessionFails >= 2) return null;

  async function watch() {
    if (started.current) return;
    started.current = true;
    capture("ad_opt_in", { is_seed: false, slot });
    setState("watching");
    // Cascada: sin patrocinador ni programático configurados → house ad
    // (promo interna ~3 s). La recompensa se concede igual (§4.2).
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
    <button
      onClick={watch}
      disabled={state === "watching"}
      className="flex w-full flex-col items-center gap-0.5 rounded-[14px] border border-[var(--gold)] px-4 py-3 text-center disabled:opacity-80"
    >
      <span className="text-[14px] font-bold text-[var(--gold)]">
        {state === "watching" ? t("ad.watching", { s: String(left) }) : cta}
      </span>
      {note && <span className="text-[11px] text-[var(--muted)]">{note}</span>}
      {state === "watching" && (
        <span className="mono mt-1 text-[10px] uppercase tracking-[0.1em] text-[var(--muted2)]">
          {t("ad.house")}
        </span>
      )}
    </button>
  );
}
