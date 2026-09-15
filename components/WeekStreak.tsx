"use client";
import { t } from "@/lib/i18n";

// Racha semanal como en la versión antigua: los días L M X J V S D arriba, un
// 🔥 en cada día completado de ESTA semana, y el 🏆 del premio al final. Misma
// lógica que el legacy: hit = i<=hoy && (hoy-i)<racha.
const DAYS = ["L", "M", "X", "J", "V", "S", "D"];

export function WeekStreak({ streakDays, streakBest, shields }: {
  streakDays: number; streakBest: number; shields: number;
}) {
  const dow = (new Date().getDay() + 6) % 7; // Lun=0 … Dom=6
  const doneThisWeek = Math.min(dow + 1, streakDays);
  const weekComplete = dow >= 6 && streakDays >= 7;
  const remaining = Math.max(0, 7 - doneThisWeek);

  return (
    <section className="rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] p-4">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <div className="text-2xl font-black text-[var(--gold)]">🔥 {streakDays}</div>
          <div className="text-[11px] text-[var(--muted)]">{t("hoy.streak")}</div>
        </div>
        <div className="text-right">
          <div className="mono text-sm font-bold text-[var(--cream)]">{"🛡".repeat(shields) || "—"}</div>
          <div className="text-[10px] text-[var(--muted2)]">{t("hoy.best", { n: String(streakBest) })}</div>
        </div>
      </div>

      <div className="flex items-start gap-1">
        {DAYS.map((d, i) => {
          const hit = i <= dow && (dow - i) < streakDays;
          const isToday = i === dow;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="grid aspect-square w-full place-items-center rounded-[10px] text-[15px]"
                style={{
                  background: hit ? "rgba(255,138,0,0.18)" : "var(--ink3)",
                  border: isToday ? "2px solid var(--gold)" : "1px solid var(--line)",
                }}>
                {hit ? "🔥" : <span className="text-[var(--muted2)]">·</span>}
              </div>
              <span className="text-[10px] font-bold" style={{ color: hit ? "var(--gold)" : "var(--muted)" }}>{d}</span>
            </div>
          );
        })}
        {/* premio de la semana */}
        <div className="flex flex-1 flex-col items-center gap-1">
          <div className="grid aspect-square w-full place-items-center rounded-[10px] text-[16px]"
            style={{
              background: weekComplete ? "rgba(255,209,102,0.22)" : "var(--ink3)",
              border: weekComplete ? "2px solid var(--gold)" : "1px dashed var(--muted2)",
              filter: weekComplete ? "none" : "grayscale(0.5) opacity(0.7)",
            }}>🏆</div>
          <span className="whitespace-nowrap text-[9px] font-bold" style={{ color: weekComplete ? "var(--gold)" : "var(--muted)" }}>{t("week.prize")}</span>
        </div>
      </div>

      <p className="mt-3 text-center text-[12px] font-semibold" style={{ color: weekComplete ? "var(--win)" : "var(--muted)" }}>
        {weekComplete ? t("week.done") : t("week.sub", { n: String(remaining) })}
      </p>
    </section>
  );
}
