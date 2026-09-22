"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { GlassCard, Chip } from "@/components/backstage/ui";
import { tMoney as t, moneyErr } from "@/components/admin/MoneyI18n";

// Eventos del proveedor (M0): últimos 100 webhooks verificados (idempotentes
// por event_id). Los que fallaron por datos se reintentan con
// rpc('money_event_retry'); los duplicados se ignoran. Solo admin (layout).

export type EventRow = {
  event_id: string; provider: string; type: string;
  received_at: string; processed_at: string | null; error: string | null;
};
export type EventsData = { events: EventRow[]; backend: boolean };

function fechaES(iso: string | null | undefined): string {
  if (!iso) return t("adminMoney.dash");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t("adminMoney.dash");
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(d);
}

export function MoneyEventsAdmin({ initial }: { initial: EventsData }) {
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>(initial.events);
  useEffect(() => { setEvents(initial.events); }, [initial]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function retry(e: EventRow) {
    const sb = supabaseBrowser();
    if (!sb) { setMsg({ kind: "err", text: t("adminMoney.err.no_backend") }); return; }
    setBusy(e.event_id); setMsg(null);
    const { data, error } = await sb.rpc("money_event_retry", { p_event_id: e.event_id });
    setBusy(null);
    if (error) { setMsg({ kind: "err", text: moneyErr(error.message) }); return; }
    setMsg({ kind: "ok", text: data === false ? t("adminMoney.events.retriedDup") : t("adminMoney.events.retried") });
    router.refresh();
  }

  const th = "px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-[rgba(244,241,233,0.45)]";
  const td = "px-2 py-1.5 text-[13px] text-[var(--cream)] align-top";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-[var(--cream)]">{t("adminMoney.events.title")}</h2>
        <p className="mt-1 max-w-[80ch] text-[12px] leading-relaxed text-[rgba(244,241,233,0.5)]">{t("adminMoney.events.how")}</p>
      </div>
      {msg && <p className={`text-sm font-bold ${msg.kind === "ok" ? "text-[var(--win)]" : "text-[var(--red)]"}`}>{msg.text}</p>}

      <GlassCard glow="none">
        {events.length === 0 ? (
          <p className="text-sm text-[rgba(244,241,233,0.5)]">{t("adminMoney.events.empty")}</p>
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
                <th className={th} />
              </tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.event_id} className="border-b border-[rgba(244,241,233,0.06)]">
                    <td className={`${td} mono text-[11px] break-all`}>{e.event_id}</td>
                    <td className={`${td} mono`}>{e.provider}</td>
                    <td className={`${td} mono text-[11px]`}>{e.type}</td>
                    <td className={`${td} mono text-[11px]`}>{fechaES(e.received_at)}</td>
                    <td className={`${td} mono text-[11px]`}>
                      {e.processed_at ? fechaES(e.processed_at) : <Chip tone="muted">{t("adminMoney.events.pending")}</Chip>}
                    </td>
                    <td className={`${td} text-[11px] ${e.error ? "text-[var(--red)]" : "text-[rgba(244,241,233,0.35)]"}`}>{e.error ?? t("adminMoney.dash")}</td>
                    <td className={td}>
                      {e.error && !e.processed_at && (
                        <button onClick={() => retry(e)} disabled={busy === e.event_id}
                          className="rounded-[10px] border border-[var(--gold)] px-3 py-1.5 text-[12px] font-black text-[var(--gold)] disabled:opacity-50">
                          {t("adminMoney.events.retry")}
                        </button>
                      )}
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
