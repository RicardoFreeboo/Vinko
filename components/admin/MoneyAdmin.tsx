"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { GlassCard, Chip, DataReadout } from "@/components/backstage/ui";
import { tMoney as t, moneyErr } from "@/components/admin/MoneyI18n";

// Consola del módulo de dinero (M0, bloque B5). Todo apagado: cada país en
// «solo puntos», sin bolsas y con el kill switch a mano. Vinko solo guarda
// referencias; la bolsa la opera un proveedor licenciado y aquí no hay saldos.
// Copia el estilo de components/admin/SponsorsAdmin.tsx: página de servidor que
// consulta con supabaseServer y componente cliente que actúa con rpc.

export type MoneyMode = "points_only" | "affiliate_only" | "partner" | "own";
export type PoolStatus = "draft" | "open" | "closed" | "settled" | "voided";

export type CountryRow = {
  iso: string; mode: string; enabled: boolean; provider: string | null;
  legal_basis_ref: string | null; domain: string | null; currency: string | null;
};
export type EventRow = {
  event_id: string; provider: string; type: string;
  received_at: string; processed_at: string | null; error: string | null;
};
export type OverviewData = {
  killSwitch: boolean;
  env: string;
  countries: CountryRow[];
  poolCounts: Record<string, number>;
  events: EventRow[];
  backend: boolean;
};

const TABS: { href: string; key: string }[] = [
  { href: "/admin/money", key: "adminMoney.tabs.overview" },
  { href: "/admin/money/config", key: "adminMoney.tabs.config" },
  { href: "/admin/money/pools", key: "adminMoney.tabs.pools" },
  { href: "/admin/money/events", key: "adminMoney.tabs.events" },
  { href: "/admin/money/revenue", key: "adminMoney.tabs.revenue" },
];
const POOL_STATES: PoolStatus[] = ["draft", "open", "closed", "settled", "voided"];

// Sub-navegación de las cuatro pantallas del módulo. La comparten las páginas
// de servidor (se puede renderizar un componente cliente desde el servidor).
export function MoneyTabs() {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-2">
      {TABS.map((it) => {
        const active = path === it.href;
        return (
          <Link key={it.href} href={it.href} style={{ fontFamily: "var(--font-mono2), monospace" }}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.08em] ${
              active
                ? "border-[var(--gold)] bg-[var(--gold)] text-[#060b09]"
                : "border-[rgba(255,194,61,0.25)] text-[rgba(244,241,233,0.6)] hover:border-[var(--gold)] hover:text-[var(--gold)]"
            }`}>
            {t(it.key)}
          </Link>
        );
      })}
    </nav>
  );
}

export function fechaES(iso: string | null | undefined): string {
  if (!iso) return t("adminMoney.dash");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t("adminMoney.dash");
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
  }).format(d);
}

const lbl = "text-[11px] font-bold uppercase tracking-wide text-[rgba(244,241,233,0.5)]";

export function MoneyAdmin({ initial }: { initial: OverviewData }) {
  const router = useRouter();
  const [data, setData] = useState<OverviewData>(initial);
  useEffect(() => { setData(initial); }, [initial]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggleKill() {
    const sb = supabaseBrowser();
    if (!sb) { setMsg({ kind: "err", text: t("adminMoney.err.no_backend") }); return; }
    setBusy(true); setMsg(null);
    const { error } = await sb.rpc("money_kill_switch_set", { p_on: !data.killSwitch });
    setBusy(false);
    if (error) { setMsg({ kind: "err", text: moneyErr(error.message) }); return; }
    setData((d) => ({ ...d, killSwitch: !d.killSwitch }));
    setMsg({ kind: "ok", text: t("adminMoney.killSwitchSaved") });
    router.refresh();
  }

  const th = "px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-[rgba(244,241,233,0.45)]";
  const td = "px-2 py-1.5 text-[13px] text-[var(--cream)] align-top";

  return (
    <div className="flex flex-col gap-5">
      {msg && (
        <p className={`text-sm font-bold ${msg.kind === "ok" ? "text-[var(--win)]" : "text-[var(--red)]"}`}>{msg.text}</p>
      )}

      {/* entorno + kill switch */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_2fr]">
        <GlassCard glow="none">
          <DataReadout value={data.env} label={t("adminMoney.env")} accent="var(--gold)" />
          <p className="mt-2 text-[11px] leading-snug text-[rgba(244,241,233,0.45)]">{t("adminMoney.envHint")}</p>
        </GlassCard>
        <GlassCard glow={data.killSwitch ? "gold" : "win"}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={lbl}>{t("adminMoney.killSwitch")}</div>
              <div className={`mt-1 text-lg font-bold ${data.killSwitch ? "text-[var(--gold)]" : "text-[var(--win)]"}`}>
                {data.killSwitch ? t("adminMoney.killSwitchOn") : t("adminMoney.killSwitchOff")}
              </div>
            </div>
            <button onClick={toggleKill} disabled={busy || !data.backend}
              className={`rounded-[10px] px-3 py-2 text-[12px] font-black disabled:opacity-50 ${
                data.killSwitch
                  ? "bg-[var(--win)] text-[#060b09]"
                  : "border border-[var(--gold)] text-[var(--gold)]"
              }`}>
              {data.killSwitch ? t("adminMoney.killSwitchTurnOff") : t("adminMoney.killSwitchTurnOn")}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-[rgba(244,241,233,0.45)]">{t("adminMoney.killSwitchHint")}</p>
        </GlassCard>
      </div>

      {/* países */}
      <GlassCard glow="none">
        <div className="mb-1 font-bold text-[var(--cream)]">{t("adminMoney.countries")}</div>
        <p className="mb-3 text-[11px] leading-snug text-[rgba(244,241,233,0.45)]">{t("adminMoney.countriesHint")}</p>
        {data.countries.length === 0 ? (
          <p className="text-sm text-[rgba(244,241,233,0.5)]">{t("adminMoney.noCountries")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-[rgba(244,241,233,0.1)]">
                <th className={th}>{t("adminMoney.col.country")}</th>
                <th className={th}>{t("adminMoney.col.mode")}</th>
                <th className={th}>{t("adminMoney.col.enabled")}</th>
                <th className={th}>{t("adminMoney.col.provider")}</th>
                <th className={th}>{t("adminMoney.col.legalBasis")}</th>
                <th className={th}>{t("adminMoney.col.domain")}</th>
                <th className={th}>{t("adminMoney.col.currency")}</th>
              </tr></thead>
              <tbody>
                {data.countries.map((c) => (
                  <tr key={c.iso} className="border-b border-[rgba(244,241,233,0.06)]">
                    <td className={`${td} mono font-bold`}>{c.iso}</td>
                    <td className={td}>{t(`adminMoney.mode.${c.mode}`)}</td>
                    <td className={td}>
                      <Chip tone={c.enabled ? "win" : "muted"}>{c.enabled ? t("adminMoney.yes") : t("adminMoney.no")}</Chip>
                    </td>
                    <td className={`${td} mono`}>{c.provider ?? t("adminMoney.dash")}</td>
                    <td className={`${td} mono text-[11px]`}>{c.legal_basis_ref ?? t("adminMoney.dash")}</td>
                    <td className={`${td} mono text-[11px]`}>{c.domain ?? t("adminMoney.dash")}</td>
                    <td className={`${td} mono`}>{c.currency ?? t("adminMoney.dash")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* bolsas por estado */}
      <GlassCard glow="none">
        <div className="mb-3 font-bold text-[var(--cream)]">{t("adminMoney.poolsByStatus")}</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {POOL_STATES.map((s) => (
            <DataReadout key={s} value={String(data.poolCounts[s] ?? 0)} label={t(`adminMoney.status.${s}`)} />
          ))}
        </div>
      </GlassCard>

      {/* últimos eventos */}
      <GlassCard glow="none">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="font-bold text-[var(--cream)]">{t("adminMoney.lastEvents")}</span>
          <Link href="/admin/money/events" className="text-[12px] font-bold text-[var(--gold)] underline">{t("adminMoney.seeAll")}</Link>
        </div>
        {data.events.length === 0 ? (
          <p className="text-sm text-[rgba(244,241,233,0.5)]">{t("adminMoney.noEvents")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-[rgba(244,241,233,0.1)]">
                <th className={th}>{t("adminMoney.col.eventId")}</th>
                <th className={th}>{t("adminMoney.col.provider")}</th>
                <th className={th}>{t("adminMoney.col.type")}</th>
                <th className={th}>{t("adminMoney.col.received")}</th>
                <th className={th}>{t("adminMoney.col.processed")}</th>
                <th className={th}>{t("adminMoney.col.error")}</th>
              </tr></thead>
              <tbody>
                {data.events.map((e) => (
                  <tr key={e.event_id} className="border-b border-[rgba(244,241,233,0.06)]">
                    <td className={`${td} mono text-[11px] break-all`}>{e.event_id}</td>
                    <td className={`${td} mono`}>{e.provider}</td>
                    <td className={`${td} mono text-[11px]`}>{e.type}</td>
                    <td className={`${td} mono text-[11px]`}>{fechaES(e.received_at)}</td>
                    <td className={`${td} mono text-[11px]`}>{e.processed_at ? fechaES(e.processed_at) : t("adminMoney.events.pending")}</td>
                    <td className={`${td} text-[11px] ${e.error ? "text-[var(--red)]" : "text-[rgba(244,241,233,0.35)]"}`}>
                      {e.error ?? t("adminMoney.dash")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
