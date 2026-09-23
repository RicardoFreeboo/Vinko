import { supabaseServer } from "@/lib/supabase/server";
import { MoneyAdmin, MoneyTabs, type OverviewData, type CountryRow, type EventRow } from "@/components/admin/MoneyAdmin";
import { tMoney as t } from "@/components/admin/MoneyI18n";

export const dynamic = "force-dynamic";

// Resumen del módulo de dinero (M0): estado del kill switch, tabla de países,
// recuento de bolsas por estado, últimos eventos del proveedor y entorno.
// Solo admin (lo comprueba el layout). Vinko solo guarda referencias: no hay
// saldos de nadie y hoy todo está apagado (cada país en «solo puntos»).
type MoneyCfgValue = {
  global?: { kill_switch?: boolean };
  countries?: Record<string, {
    mode?: string; enabled?: boolean; provider?: string | null;
    legal_basis_ref?: string | null; domain?: string | null; currency?: string | null;
  }>;
};

export default async function AdminMoney() {
  const sb = await supabaseServer();
  const data: OverviewData = {
    killSwitch: false, p2pEnabled: false, env: "production", countries: [], poolCounts: {}, events: [], backend: !!sb,
  };

  if (sb) {
    const [{ data: cfgRows }, poolsRes, evRes] = await Promise.all([
      sb.from("remote_config").select("key, value").in("key", ["money", "misc", "p2p"]),
      sb.from("money_pools").select("status").limit(2000),
      sb.from("money_events").select("event_id, provider, type, received_at, processed_at, error")
        .order("received_at", { ascending: false }).limit(10),
    ]);

    const rows = (cfgRows ?? []) as { key: string; value: unknown }[];
    const money = (rows.find((r) => r.key === "money")?.value ?? {}) as MoneyCfgValue;
    const misc = (rows.find((r) => r.key === "misc")?.value ?? {}) as { env?: string };
    data.env = misc.env ?? "production";
    data.killSwitch = !!money.global?.kill_switch;
    const p2p = (rows.find((r) => r.key === "p2p")?.value ?? {}) as { enabled?: boolean };
    data.p2pEnabled = !!p2p.enabled;

    const countries = money.countries ?? {};
    data.countries = Object.keys(countries).sort().map((iso): CountryRow => {
      const c = countries[iso] ?? {};
      return {
        iso, mode: c.mode ?? "points_only", enabled: !!c.enabled,
        provider: c.provider ?? null, legal_basis_ref: c.legal_basis_ref ?? null,
        domain: c.domain ?? null, currency: c.currency ?? null,
      };
    });

    for (const p of (poolsRes.data ?? []) as { status: string }[]) {
      data.poolCounts[p.status] = (data.poolCounts[p.status] ?? 0) + 1;
    }
    data.events = (evRes.data ?? []) as EventRow[];
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display), system-ui" }}>
          {t("adminMoney.title")}
        </h1>
        <p className="mt-2 max-w-[72ch] text-[13px] leading-relaxed text-[rgba(244,241,233,0.55)]">{t("adminMoney.how")}</p>
      </div>
      <MoneyTabs />
      <MoneyAdmin initial={data} />
    </div>
  );
}
