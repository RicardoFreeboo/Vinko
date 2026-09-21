import { supabaseServer } from "@/lib/supabase/server";
import { PorrasAdmin, type AdminPorra, type AdminDaily, type AdminDispute } from "@/components/admin/PorrasAdmin";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Porras reales (usuario + editorial, nunca plantillas) ordenadas por urgencia:
// impugnadas (reparto congelado) → cerradas sin resolver (Vinkos parados) →
// abiertas → resueltas/anuladas (con su SLA: minutos del cierre a la resolución).
// Admin ve todo por RLS (porras_read is_admin, picks_read_admin).
type Row = {
  id: string; slug: string; title: string; source: string; status: string;
  closes_at: string; created_at: string; winning_option_id: string | null;
  void_reason?: string | null; resolved_at?: string | null;
  porra_options: { id: string; idx: number; label: string }[] | null;
};

const SELECT = "id, slug, title, source, status, closes_at, created_at, winning_option_id, " +
  "porra_options!porra_options_porra_id_fkey ( id, idx, label )";
// Columnas opcionales por migración: void_reason (0030), resolved_at (0033).
// Se intenta de más a menos para que el panel no se rompa sin ellas.
const EXTRA = [", void_reason, resolved_at", ", void_reason", ""];

export default async function AdminPorras() {
  const sb = await supabaseServer();
  let porras: AdminPorra[] = [];
  let daily: AdminDaily[] = [];
  let disputes: AdminDispute[] = [];

  if (sb) {
    let list: Row[] = [];
    for (const ex of EXTRA) {
      const res = await sb.from("porras").select(SELECT + ex).eq("is_template", false)
        .order("created_at", { ascending: false }).limit(400);
      if (!res.error) { list = (res.data ?? []) as unknown as Row[]; break; }
    }

    const [{ data: picks }, { data: dp }, disp] = await Promise.all([
      sb.from("picks").select("porra_id, points_spent").limit(20000),
      sb.from("daily_picks").select("id, scheduled_for, question, options, status").eq("status", "open")
        .order("scheduled_for", { ascending: true }),
      sb.rpc("admin_disputes"), // 0042; si aún no existe, la sección sale vacía
    ]);
    const agg = new Map<string, { n: number; pot: number }>();
    for (const k of picks ?? []) {
      const cur = agg.get(k.porra_id) ?? { n: 0, pot: 0 };
      agg.set(k.porra_id, { n: cur.n + 1, pot: cur.pot + (k.points_spent ?? 0) });
    }

    const now = Date.now();
    porras = list.map((p) => {
      const a = agg.get(p.id) ?? { n: 0, pot: 0 };
      const settled = p.status === "resolved" || p.status === "disputed";
      const sla = settled && p.resolved_at
        ? Math.max(0, Math.round((Date.parse(p.resolved_at) - Date.parse(p.closes_at)) / 60000)) : null;
      return {
        id: p.id, slug: p.slug, title: p.title, source: p.source,
        status: p.status as AdminPorra["status"],
        closes_at: p.closes_at, created_at: p.created_at,
        winning_option_id: p.winning_option_id, void_reason: p.void_reason ?? null,
        resolved_at: p.resolved_at ?? null, sla_minutes: sla,
        options: (p.porra_options ?? []).slice().sort((x, y) => x.idx - y.idx).map((o) => ({ id: o.id, label: o.label })),
        picks: a.n, pot: a.pot,
        closed: p.status === "open" && Date.parse(p.closes_at) <= now,
      };
    });
    // 0 = cerrada sin resolver (la más antigua primero), 1 = abierta (cierra
    // antes primero), 2 = terminada (la más reciente primero).
    const phase = (p: AdminPorra) => (p.status === "open" ? (p.closed ? 0 : 1) : 2);
    porras.sort((a, b) => {
      const d = phase(a) - phase(b);
      if (d !== 0) return d;
      return phase(a) === 2 ? b.created_at.localeCompare(a.created_at) : a.closes_at.localeCompare(b.closes_at);
    });

    daily = (dp ?? []).map((d) => ({
      id: d.id, scheduled_for: d.scheduled_for, question: d.question, options: (d.options as string[]) ?? [],
    }));

    if (!disp.error && Array.isArray(disp.data)) disputes = disp.data as AdminDispute[];
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display), system-ui" }}>
          {t("admin.porras.title")}
        </h1>
        <p className="mt-2 max-w-[72ch] text-[13px] leading-relaxed text-[rgba(244,241,233,0.55)]">
          {t("admin.porras.how")}
        </p>
      </div>
      <PorrasAdmin initial={porras} daily={daily} disputes={disputes} />
    </div>
  );
}
