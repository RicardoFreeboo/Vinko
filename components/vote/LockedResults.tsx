import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { t } from "@/lib/i18n";

// Reparto OCULTO hasta votar (VINKO_PANTALLAS §2 · tapa la "fuga de reparto"):
// barras borrosas + quién ha votado + "Vota para ver qué dijo {quién}". 1:1 con
// `.lockcard` del HTML. Antiherd / anticasino: el consenso no se ve antes de votar.
export function LockedResults({
  total, who = null, avatars, bars = 2,
}: {
  total: number;         // cuántos han votado ya
  who?: string | null;   // nombre de referencia ("Juan") para la llamada a la acción
  avatars?: ReactNode;   // pila de avatares opcional
  bars?: number;         // nº de barras borrosas (solo estético)
}) {
  return (
    <div className="relative overflow-hidden rounded-[18px] border border-dashed border-[var(--line)] bg-[var(--ink2)] p-3.5">
      <div className="flex flex-col gap-2 opacity-75 blur-[5px]" aria-hidden>
        {Array.from({ length: Math.max(1, bars) }).map((_, i) => (
          <span
            key={i}
            className="block h-5 rounded-[7px]"
            style={{ width: `${70 - i * 22}%`, background: i % 2 === 0 ? "rgba(31,224,122,0.5)" : "rgba(255,194,61,0.5)" }}
          />
        ))}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-[rgba(12,16,17,0.35)] px-4 text-center">
        {avatars}
        {total > 0 && (
          <p className="text-[13px] font-bold text-[var(--cream)]">
            {who ? t("locked.whoAndMore", { who, n: String(Math.max(0, total - 1)) }) : t("locked.count", { n: String(total) })}
          </p>
        )}
        <p className="flex items-center gap-1.5 text-[12px] font-black text-[var(--win)]">
          <Lock size={13} aria-hidden />
          {who ? t("locked.voteToSeeWho", { who }) : t("locked.voteToSee")}
        </p>
      </div>
    </div>
  );
}
