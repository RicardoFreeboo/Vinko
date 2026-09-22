"use client";
import { VinkoCoin } from "@/components/VinkoCoin";
import { t } from "@/lib/i18n";

// Cuántos Vinkos pones en la porra. Chips rápidos + campo para escribir la
// cantidad que quieras (dentro del rango permitido; make_pick valida el mismo
// rango en servidor). El importe solo cambia el bote de puntos: la PRECISIÓN no
// depende de cuánto pongas (§7.1), así que apostar más no compra premios ni nivel.
const IMPORTES = [10, 50, 100, 500];
const MIN = 10;
const MAX = 1000;

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function StakePicker({ value, onChange, min = MIN, max = MAX }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  const hi = Math.max(min, max);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">{t("pick.stake")}</span>
        <div className="flex flex-1 gap-1">
          {IMPORTES.map((n) => {
            const on = value === n;
            const nope = n > hi || n < min;
            return (
              <button key={n} type="button" disabled={nope} onClick={() => onChange(clamp(n, min, hi))}
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
      {/* Cantidad libre */}
      <div className="flex items-center gap-2 rounded-[9px] border border-[var(--line)] px-2.5 py-1.5">
        <VinkoCoin size={13} />
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={hi}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value), min, hi))}
          onBlur={(e) => onChange(clamp(Number(e.target.value), min, hi))}
          aria-label={t("pick.stakeCustom")}
          className="w-full bg-transparent text-[14px] font-black text-[var(--cream)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="mono text-[10px] whitespace-nowrap text-[var(--muted)]">{min}–{hi}</span>
      </div>
    </div>
  );
}
