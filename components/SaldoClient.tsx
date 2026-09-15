"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { RewardedSlot, type SlotId } from "@/components/ads/RewardedSlot";
import { t } from "@/lib/i18n";

// Monedas (gastas) · Nivel (subes) · Puntería (compites). Aquí se ve el saldo,
// se recogen las monedas que gotean, y se enseña CÓMO ganar más (crear, jugar,
// compartir, invitar, ver anuncios, racha). Sin disclaimers de dinero: no hay
// ninguna forma de comprar/canjear, así que no hace falta decirlo.
const DIVISIONS: Record<string, string> = {
  bronce: "Bronce", plata: "Plata", oro: "Oro", diamante: "Diamante", leyenda: "Leyenda",
};

export function SaldoClient({
  initialPoints, xp, marcador, division, shields, isAdult, recoverable, brokenDays,
}: {
  initialPoints: number; xp: number; marcador: number; division: string;
  shields: number; isAdult: boolean; recoverable: boolean; brokenDays: number;
}) {
  const router = useRouter();
  const [points, setPoints] = useState(initialPoints);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function recharge() {
    const sb = supabaseBrowser();
    if (!sb) return;
    const { data, error } = await sb.rpc("claim_drip");
    if (!error && (data ?? 0) > 0) {
      setPoints((p) => p + data);
      setMsg({ kind: "ok", text: t("saldo.rechargeGot", { n: String(data) }) });
    } else if (!error) {
      setMsg({ kind: "ok", text: t("saldo.rechargeNone") });
    }
    router.refresh();
  }

  function onGranted(slot: SlotId, g: { granted: number; reward?: string; value?: number }) {
    if (slot === "R2" && g.reward === "pts") {
      setPoints((p) => p + (g.value ?? 0));
      setMsg({ kind: "ok", text: t("saldo.granted", { n: String(g.value ?? 0) }) });
    } else if (g.reward === "shield") setMsg({ kind: "ok", text: t("saldo.rewardShield") });
    else if (g.reward === "streak_recover") setMsg({ kind: "ok", text: t("saldo.rewardRecover") });
    else setMsg({ kind: "ok", text: t("saldo.rewardGeneric") });
    router.refresh();
  }
  function onError(code: string) {
    if (code.includes("VINKO_AD_CAP")) setMsg({ kind: "err", text: t("saldo.cap") });
    else if (code === "duplicate") setMsg({ kind: "ok", text: t("saldo.already") });
    else setMsg({ kind: "err", text: t("saldo.error") });
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={points} label={t("saldo.coins")} icon="🪙" color="var(--win)" hint={t("saldo.coinsHint")} />
        <Stat value={xp} label={t("saldo.level")} icon="▲" color="var(--gold)" hint={t("saldo.levelHint")} />
        <Stat value={marcador} label={t("saldo.skill")} icon="🎯" color="var(--cream)" hint={t("saldo.skillHint")} />
      </div>
      <div className="flex items-center justify-between rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-2.5">
        <span className="text-xs text-[var(--muted)]">{t("saldo.division")}</span>
        <span className="text-sm font-black text-[var(--gold)]">{DIVISIONS[division] ?? division}</span>
      </div>

      {/* recarga automática (goteo), explicada */}
      <button onClick={recharge}
        className="flex flex-col items-center rounded-[14px] bg-[var(--win)] px-4 py-3 text-center text-[var(--ink)]">
        <span className="text-[15px] font-black">{t("saldo.recharge")}</span>
        <span className="text-[11px] font-semibold opacity-80">{t("saldo.rechargeSub")}</span>
      </button>

      {/* cómo ganar monedas */}
      <section className="flex flex-col gap-2">
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("saldo.earn")}</p>

        {isAdult && (
          <RewardedSlot slot="R2" cta={t("saldo.r2", { n: "200" })}
            onGranted={(g) => onGranted("R2", g)} onError={onError} />
        )}
        {isAdult && shields < 2 && (
          <RewardedSlot slot="R3" cta={t("saldo.r3")}
            onGranted={(g) => onGranted("R3", g)} onError={onError} />
        )}
        {isAdult && recoverable && (
          <RewardedSlot slot="R1" cta={t("saldo.r1", { n: String(brokenDays) })}
            onGranted={(g) => onGranted("R1", g)} onError={onError} />
        )}

        <EarnRow icon="🎁" title={t("saldo.earn.daily")} value="≤500" href="/saldo" />
        <EarnRow icon="🎯" title={t("saldo.earn.pick")} value="+150" href="/feed" />
        <EarnRow icon="✏️" title={t("saldo.earn.create")} value="+Nivel" href="/nueva" />
        <EarnRow icon="🤝" title={t("saldo.earn.invite")} value="+200" href="/grupos" />
        <EarnRow icon="📲" title={t("saldo.earn.share")} value="+50" href="/feed" />
        <EarnRow icon="🔥" title={t("saldo.earn.streak")} value="🏆" href="/saldo" />
      </section>

      {msg && (
        <p className={`text-center text-sm font-bold ${msg.kind === "ok" ? "text-[var(--win)]" : "text-[var(--red)]"}`}>
          {msg.text}
        </p>
      )}
    </>
  );
}

function Stat({ value, label, icon, color, hint }: { value: number; label: string; icon: string; color: string; hint: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] p-2.5 text-center">
      <div className="mono text-lg font-black leading-none" style={{ color }}>{icon} {value}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[var(--cream)]">{label}</div>
      <div className="mt-0.5 text-[9px] leading-tight text-[var(--muted)]">{hint}</div>
    </div>
  );
}

function EarnRow({ icon, title, value, href }: { icon: string; title: string; value: string; href: string }) {
  return (
    <Link href={href}
      className="flex items-center justify-between rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3">
      <span className="flex items-center gap-3">
        <span className="text-lg leading-none">{icon}</span>
        <span className="text-[14px] font-bold text-[var(--cream)]">{title}</span>
      </span>
      <span className="mono text-sm font-black text-[var(--win)]">{value}</span>
    </Link>
  );
}
