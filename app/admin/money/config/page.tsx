import { supabaseServer } from "@/lib/supabase/server";
import { MoneyTabs } from "@/components/admin/MoneyAdmin";
import { MoneyConfigAdmin, type ConfigData, type CountryCfg } from "@/components/admin/MoneyConfigAdmin";
import { tMoney as t } from "@/components/admin/MoneyI18n";

export const dynamic = "force-dynamic";

// Configuración por país del módulo de dinero (M0). Lee remote_config.money y
// deja que el cliente edite cada país vía rpc('money_config_set_country'), la
// única vía de escritura. Solo admin (lo comprueba el layout).
type MoneyCfgValue = { global?: { rake_bps_default?: number }; countries?: Record<string, CountryCfg> };

export default async function AdminMoneyConfig() {
  const sb = await supabaseServer();
  const data: ConfigData = { countries: {}, env: "production", rakeBpsDefault: 500 };

  if (sb) {
    const { data: rows } = await sb.from("remote_config").select("key, value").in("key", ["money", "misc"]);
    const list = (rows ?? []) as { key: string; value: unknown }[];
    const money = (list.find((r) => r.key === "money")?.value ?? {}) as MoneyCfgValue;
    const misc = (list.find((r) => r.key === "misc")?.value ?? {}) as { env?: string };
    data.countries = money.countries ?? {};
    data.env = misc.env ?? "production";
    data.rakeBpsDefault = money.global?.rake_bps_default ?? 500;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display), system-ui" }}>
          {t("adminMoney.title")}
        </h1>
      </div>
      <MoneyTabs />
      <MoneyConfigAdmin initial={data} />
    </div>
  );
}
