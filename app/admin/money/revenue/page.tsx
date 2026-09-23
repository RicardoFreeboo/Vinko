import { supabaseServer } from "@/lib/supabase/server";
import { MoneyTabs } from "@/components/admin/MoneyAdmin";
import { MoneyRevenueAdmin, type RevSummary } from "@/components/admin/MoneyRevenueAdmin";
import { tMoney as t } from "@/components/admin/MoneyI18n";

export const dynamic = "force-dynamic";

// Parte B (VINKO_BILLING_SPEC): conciliación del rev-share del operador. Solo
// admin (layout). Registra lo que el operador liquida a Vinko; no mueve el bote.
const EMPTY: RevSummary = { statements: [], settled_pools: 0, total_share_minor: 0, pending_share_minor: 0 };

export default async function AdminMoneyRevenue() {
  const sb = await supabaseServer();
  let data: RevSummary = EMPTY;
  if (sb) {
    const { data: sum } = await sb.rpc("revenue_share_summary");
    if (sum) data = sum as RevSummary;
  }
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display), system-ui" }}>
          {t("adminMoney.rev.title")}
        </h1>
      </div>
      <MoneyTabs />
      <MoneyRevenueAdmin initial={data} />
    </div>
  );
}
