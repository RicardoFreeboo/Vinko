"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PushPrePrompt, InstallHint } from "@/components/PushPrePrompt";
import { WeekStreak } from "@/components/WeekStreak";
import { capture } from "@/lib/analytics";
import { t } from "@/lib/i18n";

type Daily = {
  id: string;
  question: string;
  options: string[];
  status: string;
  correct_idx: number | null;
};
type PrevDay = {
  question: string;
  options: string[];
  correct_idx: number | null;
  answer: { option_idx: number; correct: boolean | null; pts: number; score: number } | null;
};

export function HoyClient({
  daily, myAnswer, prev, streakDays, streakBest, shields,
  bonusClaimedToday, bonusStep,
}: {
  daily: Daily | null;
  myAnswer: number | null;
  prev: PrevDay | null;
  streakDays: number;
  streakBest: number;
  shields: number;
  bonusClaimedToday: boolean;
  bonusStep: number;
}) {
  const router = useRouter();
  const [answered, setAnswered] = useState(myAnswer);
  const [busy, setBusy] = useState(false);
  const [bonusMsg, setBonusMsg] = useState<string | null>(null);
  const [bonusDone, setBonusDone] = useState(bonusClaimedToday);
  const [err, setErr] = useState<string | null>(null);

  async function answer(idx: number) {
    if (!daily || answered !== null || busy) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true); setErr(null);
    const { error } = await sb.rpc("answer_daily", { p_day: daily.id, p_idx: idx });
    setBusy(false);
    if (error) { setErr(t("hoy.err")); return; }
    capture("daily_pick_submitted", { is_seed: false });
    setAnswered(idx);
    router.refresh();
  }

  async function claimBonus() {
    const sb = supabaseBrowser();
    if (!sb || bonusDone) return;
    const { data, error } = await sb.rpc("claim_daily_bonus");
    if (!error) {
      setBonusDone(true);
      if ((data ?? 0) > 0) setBonusMsg(t("hoy.bonusGot", { n: String(data) }));
      router.refresh();
    }
  }

  const hasValue = answered !== null || (prev?.answer != null);

  return (
    <>
      {/* racha SEMANAL (§3.4): días de la semana, fuego al completar, premio al final */}
      <WeekStreak streakDays={streakDays} streakBest={streakBest} shields={shields} />

      {/* bonus diario (escalera de 7, §3.8) */}
      {!bonusDone ? (
        <button
          onClick={claimBonus}
          className="rounded-[14px] bg-[var(--win)] px-4 py-3.5 text-[15px] font-black text-[var(--ink)]"
        >
          {t("hoy.bonusCta", { n: String(bonusStep + 1) })}
        </button>
      ) : bonusMsg ? (
        <p className="text-center text-sm font-bold text-[var(--win)]">{bonusMsg}</p>
      ) : null}

      {/* pronóstico del día (ancla 1) */}
      <section className="rounded-[16px] border border-[var(--win)] bg-[var(--ink2)] p-4">
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--win)]">
          {t("hoy.dailyTag")}
        </p>
        {daily ? (
          <>
            <h1 className="mt-2 text-[1.25rem] font-black leading-tight text-[var(--cream)]">
              {daily.question}
            </h1>
            <div className="mt-3 flex flex-col gap-2">
              {daily.options.map((label, idx) => {
                const chosen = answered === idx;
                const isCorrect = daily.status === "resolved" && daily.correct_idx === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => answer(idx)}
                    disabled={answered !== null || busy || daily.status !== "open"}
                    className="flex items-center justify-between rounded-[12px] border px-4 py-3 text-left text-[15px] font-bold"
                    style={{
                      borderColor: isCorrect ? "var(--win)" : chosen ? "var(--gold)" : "var(--line)",
                      color: chosen ? "var(--gold)" : "var(--cream)",
                    }}
                  >
                    {label}
                    {chosen && <span>✓</span>}
                  </button>
                );
              })}
            </div>
            {answered !== null && daily.status === "open" && (
              <p className="mt-3 text-center text-xs font-bold text-[var(--win)]">
                {t("hoy.done")}
              </p>
            )}
            {err && <p className="mt-2 text-center text-xs text-[var(--red)]">{err}</p>}
          </>
        ) : (
          <p className="mt-2 text-sm text-[var(--muted)]">{t("hoy.none")}</p>
        )}
      </section>

      {/* resultado de ayer (ancla 2) */}
      {prev && (
        <section className="rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] p-4">
          <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            {t("hoy.prevTag")}
          </p>
          <p className="mt-1 text-sm font-bold text-[var(--cream)]">{prev.question}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {t("hoy.prevCorrect")}: {prev.correct_idx != null ? prev.options[prev.correct_idx] : "—"}
          </p>
          {prev.answer ? (
            prev.answer.correct ? (
              <p className="mt-2 text-sm font-black text-[var(--win)]">
                {t("hoy.prevHit", { pts: String(prev.answer.pts), score: String(prev.answer.score) })}
              </p>
            ) : (
              <p className="mt-2 text-sm font-bold text-[var(--muted)]">{t("hoy.prevMiss")}</p>
            )
          ) : (
            <p className="mt-2 text-xs text-[var(--muted2)]">{t("hoy.prevNoAnswer")}</p>
          )}
        </section>
      )}

      <PushPrePrompt hasValue={hasValue} />
      <InstallHint hasValue={hasValue} />
    </>
  );
}
