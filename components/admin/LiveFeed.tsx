"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { EmptyState } from "@/components/admin/ui";
import { t } from "@/lib/i18n";

// Feed LIVE real (PASO 5d): lee la actividad de personas reales que ya está en
// la base (picks, porras creadas/resueltas, recompensas de anuncio) y refresca
// cada 10 s. Nunca inventa filas: si no hay actividad, dice que no la hay.
type Row = { ts: string; evento: string; handle: string | null; slug: string | null; origen: string | null };

const COLOR: Record<string, string> = {
  pick_made: "var(--win)",
  porra_created: "var(--gold)",
  porra_resolved: "var(--cream)",
  ad_reward_granted: "var(--muted)",
};

function hora(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Madrid",
  }).format(new Date(iso));
}

export function LiveFeed() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const sb = supabaseBrowser();
      if (!sb) { setErr("sin backend"); return; }
      const { data, error } = await sb.rpc("admin_live_feed", { p_limit: 60 });
      if (!alive) return;
      if (error) {
        // migración aún no aplicada / sin permisos: mensaje claro, no un stack
        const falta = /does not exist|schema cache|function/i.test(error.message);
        setErr(falta ? t("admin.live.pending") : error.message);
        return;
      }
      setErr(null);
      setRows((data as Row[]) ?? []);
    }
    void load();
    const id = setInterval(load, 10000); // delay < 15 s (spec §5d)
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (err) return <p className="text-[12px] text-[var(--red)]">{err}</p>;
  if (rows === null) return <p className="text-[12px] text-[var(--muted)]">…</p>;
  if (!rows.length) return <EmptyState text={t("admin.live.empty")} />;

  return (
    <div className="overflow-x-auto rounded-[12px] border border-[var(--line)] bg-[var(--ink2)]">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-[var(--line)]">
            {["time", "event", "who", "porra"].map((c) => (
              <th key={c} className="eyebrow px-4 py-2.5 text-left text-[10px] whitespace-nowrap">
                {t(`admin.live.col.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[var(--line)]/50 last:border-0">
              <td className="mono px-4 py-2 text-[var(--muted)] whitespace-nowrap">{hora(r.ts)}</td>
              <td className="px-4 py-2 font-bold whitespace-nowrap" style={{ color: COLOR[r.evento] ?? "var(--cream)" }}>
                {r.evento}
              </td>
              <td className="px-4 py-2 text-[var(--cream)] whitespace-nowrap">@{r.handle ?? "—"}</td>
              <td className="px-4 py-2 text-[var(--muted)]">
                {r.slug ? <span className="mono">{r.slug}</span> : "—"}
                {r.origen && <span className="ml-2 text-[10px] text-[var(--muted2)]">{r.origen}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
