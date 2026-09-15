"use client";
import { VinkoCoin } from "@/components/VinkoCoin";
import { t } from "@/lib/i18n";

// Cuántos Vinkos pones en la porra. Antes eran 10 fijos.
// El importe solo cambia el bote de puntos: la PRECISIÓN no depende de cuánto
// pongas (§7.1), así que apostar más no compra premios ni nivel.
const IMPORTES = [10, 50, 100, 500];

export function StakePicker({ value, onChange, max }: {
  value: number; onChange: (v: number) => void; max?: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">{t("pick.stake")}</span>
      <div className="flex flex-1 gap-1">
        {IMPORTES.map((n) => {
          const on = value === n;
          const nope = max !== undefined && n > max;
          return (
            <button key={n} type="button" disabled={nope} onClick={() => onChange(n)}
              className="flex flex-1 items-center justify-center gap-0.5 rounded-[9px] border py-1.5 text-[12px] font-black transition-colors disabled:opacity-30"
              style={{
                borderColor: on ? "var(--gold)" : "var(--line)",
                background: on ? "rgba(255,209,102,0.14)" : "transparent",
                color: on ? "var(--gold)" : "var(--muted)",
              }}>
              <VinkoCoin size={11} />{n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
