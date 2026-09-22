import { supabaseServer } from "@/lib/supabase/server";
import { MoneyTabs } from "@/components/admin/MoneyAdmin";
import { MoneyEventsAdmin, type EventsData, type EventRow } from "@/components/admin/MoneyEventsAdmin";
import { tMoney as t } from "@/components/admin/MoneyI18n";

export const dynamic = "force-dynamic";

// Eventos del proveedor (M0): últimos 100 webhooks verificados. Solo admin
// (layout). money_events es legible por admin vía RLS (0045).
export default async function AdminMoneyEvents() {
  const sb = await supabaseServer();
  const data: EventsData = { events: [], backend: !!sb };

  if (sb) {
    const { data: rows } = await sb.from("money_events")
      .select("event_id, provider, type, received_at, processed_at, error")
      .order("received_at", { ascending: false }).limit(100);
    data.events = (rows ?? []) as EventRow[];
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display), system-ui" }}>
          {t("adminMoney.title")}
        </h1>
      </div>
      <MoneyTabs />
      <MoneyEventsAdmin initial={data} />
    </div>
  );
}
