"use client";
import { madridClock } from "@/lib/gate";
import { t } from "@/lib/i18n";

// Racha semanal pintada con la actividad REAL del perfil (streak_days +
// streak_last, huso Europe/Madrid como el servidor):
//  · la racha está viva solo si streak_last es hoy o ayer; si no, 0 días.
//  · un día de la semana se enciende solo si cae dentro de la racha viva.
//  · premio = 7 días seguidos (hito "7" de streak_milestones, lo paga
//    touch_streak en el servidor).
const DAYS = ["L", "M", "X", "J", "V", "S", "D"];

// Lun=0 … Dom=6 de un YYYY-MM-DD, sin depender del huso del navegador.
function dowOf(day: string): number {
  return (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
}
function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function streakAlive(streakLast: string | null | undefined, today: string): boolean {
  return !!streakLast && (streakLast === today || streakLast === shiftDay(today, -1));
}

export function WeekStreak({ streakDays, streakBest, shields, streakLast = null, prizePts = 500, today }: {
  streakDays: number; streakBest: number; shields: number;
  streakLast?: string | null; // profiles.streak_last (YYYY-MM-DD)
  prizePts?: number;          // cfg economy → streak_milestones["7"].pts
  today?: string;             // solo para tests/capturas
}) {
  const day = today ?? madridClock().day;
  const alive = streakAlive(streakLast, day);
  const streak = alive ? Math.max(0, streakDays) : 0;
  const dow = dowOf(day);
  const lastOff = streakLast === day ? 0 : -1; // último día jugado, relativo a hoy
  // día i de ESTA semana = hoy + (i - dow); encendido si cae dentro de la racha viva
  const lit = (i: number) => alive && i - dow <= lastOff && lastOff - (i - dow) < streak;
  const complete = alive && streak >= 7;
  const remaining = Math.max(0, 7 - streak);
  const playToday = alive && lastOff === -1;

  return (
    <section className="rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] p-4">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <div className="text-2xl font-black text-[var(--gold)]">🔥 {streak}</div>
          <div className="text-[11px] text-[var(--muted)]">{t("hoy.streak")}</div>
        </div>
        <div className="text-right">
          <div className="mono text-sm font-bold text-[var(--cream)]">{"🛡".repeat(Math.max(0, shields)) || "—"}</div>
          <div className="text-[10px] text-[var(--muted2)]">{t("hoy.best", { n: String(streakBest) })}</div>
        </div>
      </div>

      <div className="flex items-start gap-1">
        {DAYS.map((d, i) => {
          const hit = lit(i);
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
        {/* premio: 7 días seguidos */}
        <div className="flex flex-1 flex-col items-center gap-1">
          <div className="grid aspect-square w-full place-items-center rounded-[10px] text-[16px]"
            style={{
              background: complete ? "rgba(255,209,102,0.22)" : "var(--ink3)",
              border: complete ? "2px solid var(--gold)" : "1px dashed var(--muted2)",
              filter: complete ? "none" : "grayscale(0.5) opacity(0.7)",
            }}>🏆</div>
          <span className="mono whitespace-nowrap text-[9px] font-bold" style={{ color: complete ? "var(--gold)" : "var(--muted)" }}>
            {t("week.prizePts", { n: String(prizePts) })}
          </span>
        </div>
      </div>

      <p className="mt-3 text-center text-[12px] font-semibold" style={{ color: complete ? "var(--win)" : "var(--muted)" }}>
        {complete ? t("week.done") : playToday ? t("week.keep", { n: String(remaining) }) : t("week.sub", { n: String(remaining) })}
      </p>
    </section>
  );
}
