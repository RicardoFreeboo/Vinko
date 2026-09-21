"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { GlassCard, Chip } from "@/components/backstage/ui";
import { capture } from "@/lib/analytics";
import { t } from "@/lib/i18n";

// Consola de porras: resolver (resolve_porra), anular (void_porra) y ampliar el
// cierre (update porras.closes_at vía la policy porras_admin_update). Arriba,
// las IMPUGNADAS (admin_disputes, 0042): mantener o rectificar (resolve_dispute).
// Debajo, el pique del día sin resolver (resolve_daily). Todo con la sesión del
// admin desde el navegador: RLS e is_admin() deciden en servidor.
export type AdminPorra = {
  id: string; slug: string; title: string; source: string;
  status: "open" | "resolved" | "disputed" | "taken_down";
  closes_at: string; created_at: string;
  winning_option_id: string | null; void_reason: string | null;
  resolved_at: string | null;
  sla_minutes: number | null; // minutos del cierre a la resolución (resueltas)
  options: { id: string; label: string }[];
  picks: number; pot: number;
  closed: boolean; // abierta pero pasada la hora de cierre
};
export type AdminDaily = { id: string; scheduled_for: string; question: string; options: string[] };
// Fila de admin_disputes(): porra congelada con los motivos de sus participantes.
export type AdminDispute = {
  id: string; slug: string; title: string; source: string; judge: string | null;
  closes_at: string; resolved_at: string | null; disputed_at: string | null;
  winning_option_id: string | null; winning_label: string | null;
  options: { id: string; label: string }[];
  participants: number; pot: number; threshold: number;
  disputes: { handle: string; reason: string; created_at: string }[];
};

type Mode = { id: string; kind: "resolve" | "void" | "extend" } | null;

const fmt = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
});
const pad = (n: number) => String(n).padStart(2, "0");
// Valor para <input type="datetime-local"> en la hora local del navegador.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PorrasAdmin({ initial, daily: initialDaily, disputes: initialDisputes = [] }: {
  initial: AdminPorra[]; daily: AdminDaily[]; disputes?: AdminDispute[];
}) {
  const router = useRouter();
  const [list, setList] = useState<AdminPorra[]>(initial);
  const [daily, setDaily] = useState<AdminDaily[]>(initialDaily);
  const [disputes, setDisputes] = useState<AdminDispute[]>(initialDisputes);
  useEffect(() => { setList(initial); }, [initial]);
  useEffect(() => { setDaily(initialDaily); }, [initialDaily]);
  useEffect(() => { setDisputes(initialDisputes); }, [initialDisputes]);

  const [mode, setMode] = useState<Mode>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // Rectificar: porra impugnada en la que se está eligiendo la nueva ganadora.
  const [rectify, setRectify] = useState<string | null>(null);
  const [newWin, setNewWin] = useState<string | null>(null);

  const stuck = useMemo(() => list.filter((p) => p.status === "open" && p.closed), [list]);
  const open = useMemo(() => list.filter((p) => p.status === "open" && !p.closed), [list]);
  // Las impugnadas tienen su propia sección arriba (con motivos).
  const done = useMemo(() => list.filter((p) => p.status !== "open" && p.status !== "disputed"), [list]);
  const stuckPot = stuck.reduce((a, p) => a + p.pot, 0);

  function start(p: AdminPorra, kind: NonNullable<Mode>["kind"]) {
    setMode({ id: p.id, kind }); setChosen(null); setReason(""); setMsg(null);
    setWhen(toLocalInput(new Date(Math.max(Date.parse(p.closes_at), Date.now()) + 86400000).toISOString()));
  }
  const patch = (id: string, fn: (p: AdminPorra) => AdminPorra) =>
    setList((l) => l.map((p) => (p.id === id ? fn(p) : p)));

  async function resolve(p: AdminPorra) {
    if (busy || !chosen) return;
    const sb = supabaseBrowser(); if (!sb) return;
    setBusy(true); setMsg(null);
    const { error } = await sb.rpc("resolve_porra", { p_porra: p.id, p_winning: chosen });
    setBusy(false);
    if (error) { setMsg({ kind: "err", text: t("admin.porras.err") }); return; }
    const label = p.options.find((o) => o.id === chosen)?.label ?? "";
    capture("porra_resolved", { is_seed: p.source !== "user", source: p.source, via: "admin" });
    patch(p.id, (x) => ({ ...x, status: "resolved", winning_option_id: chosen, closed: false }));
    setMode(null);
    setMsg({ kind: "ok", text: t("admin.porras.resolved", { o: label }) });
    router.refresh();
  }

  async function voidIt(p: AdminPorra) {
    if (busy) return;
    const sb = supabaseBrowser(); if (!sb) return;
    setBusy(true); setMsg(null);
    const { error } = await sb.rpc("void_porra", { p_porra: p.id, p_reason: reason.trim() || null });
    setBusy(false);
    if (error) { setMsg({ kind: "err", text: t("admin.porras.err") }); return; }
    patch(p.id, (x) => ({ ...x, status: "taken_down", void_reason: reason.trim() || "anulada", closed: false }));
    setMode(null);
    setMsg({ kind: "ok", text: t("admin.porras.voided") });
    router.refresh();
  }

  async function extend(p: AdminPorra) {
    if (busy || !when) return;
    const sb = supabaseBrowser(); if (!sb) return;
    const iso = new Date(when).toISOString();
    setBusy(true); setMsg(null);
    const { error, count } = await sb.from("porras").update({ closes_at: iso }, { count: "exact" }).eq("id", p.id);
    setBusy(false);
    if (error || count === 0) { setMsg({ kind: "err", text: t("admin.porras.err") }); return; }
    patch(p.id, (x) => ({ ...x, closes_at: iso, closed: Date.parse(iso) <= Date.now() }));
    setMode(null);
    setMsg({ kind: "ok", text: t("admin.porras.extended") });
    router.refresh();
  }

  async function resolveDaily(d: AdminDaily, idx: number) {
    if (busy) return;
    const sb = supabaseBrowser(); if (!sb) return;
    setBusy(true); setMsg(null);
    const { error } = await sb.rpc("resolve_daily", { p_day: d.id, p_correct: idx });
    setBusy(false);
    if (error) { setMsg({ kind: "err", text: t("admin.porras.daily.err") }); return; }
    capture("daily_pick_resolved", { is_seed: false, via: "admin" });
    setDaily((l) => l.filter((x) => x.id !== d.id));
    setMsg({ kind: "ok", text: t("admin.porras.daily.resolved", { o: d.options[idx] ?? "" }) });
    router.refresh();
  }

  // Impugnación: uphold (mantener) / reverse (rectificar con ganadora, o reabrir
  // sin ella). resolve_dispute deshace el reparto y la puntería en servidor.
  async function decide(d: AdminDispute, action: "uphold" | "reverse", winning: string | null) {
    if (busy) return;
    const sb = supabaseBrowser(); if (!sb) return;
    setBusy(true); setMsg(null);
    const { error } = await sb.rpc("resolve_dispute", { p_porra: d.id, p_action: action, p_new_winning: winning });
    setBusy(false);
    if (error) { setMsg({ kind: "err", text: t("admin.porras.disputeErr") }); return; }
    setDisputes((l) => l.filter((x) => x.id !== d.id));
    setRectify(null); setNewWin(null);
    if (action === "uphold") {
      patch(d.id, (x) => ({ ...x, status: "resolved" }));
      setMsg({ kind: "ok", text: t("admin.porras.kept") });
    } else if (winning) {
      const label = d.options.find((o) => o.id === winning)?.label ?? "";
      capture("porra_resolved", { is_seed: d.source !== "user", source: d.source, via: "admin_dispute" });
      patch(d.id, (x) => ({ ...x, status: "resolved", winning_option_id: winning }));
      setMsg({ kind: "ok", text: t("admin.porras.rectified", { o: label }) });
    } else {
      patch(d.id, (x) => ({ ...x, status: "open", winning_option_id: null, closed: true, resolved_at: null, sla_minutes: null }));
      setMsg({ kind: "ok", text: t("admin.porras.reopened") });
    }
    router.refresh();
  }

  // Funciones de render (no componentes anidados): así el estado de los inputs
  // vive en el padre sin que cada tecla desmonte la fila y pierda el foco.
  function fila(p: AdminPorra) {
    const editing = mode?.id === p.id ? mode.kind : null;
    const statusKey = p.status === "open" ? (p.closed ? "closed" : "open") : p.status;
    const statusTone = p.status === "open" ? (p.closed ? "gold" : "win") : p.status === "resolved" ? "muted" : p.status === "disputed" ? "gold" : "red";
    const winner = p.options.find((o) => o.id === p.winning_option_id)?.label;
    return (
      <li key={p.id} className="flex flex-col gap-2 border-b border-[rgba(244,241,233,0.08)] py-3 last:border-0">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5">
          <div className="min-w-[200px] flex-1">
            <Link href={`/p/${p.slug}`} target="_blank" className="font-bold text-[var(--cream)] hover:text-[var(--win)]">{p.title}</Link>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Chip tone="muted">{t(`admin.porras.source.${p.source}`)}</Chip>
              <Chip tone={statusTone}>{t(`admin.porras.status.${statusKey}`)}</Chip>
              {winner && <span className="text-[11px] text-[rgba(244,241,233,0.6)]">{t("admin.porras.winner")}: <b className="text-[var(--win)]">{winner}</b></span>}
              {p.void_reason && <span className="text-[11px] text-[rgba(244,241,233,0.6)]">{t("admin.porras.reason")}: {p.void_reason}</span>}
            </div>
          </div>
          <dl className="mono flex shrink-0 gap-4 text-[12px] text-[rgba(244,241,233,0.7)]">
            <div><dt className="text-[9px] uppercase tracking-[0.12em] text-[rgba(244,241,233,0.4)]">{t("admin.porras.col.closes")}</dt><dd>{fmt.format(new Date(p.closes_at))}</dd></div>
            <div><dt className="text-[9px] uppercase tracking-[0.12em] text-[rgba(244,241,233,0.4)]">{t("admin.porras.col.picks")}</dt><dd className="text-right">{p.picks}</dd></div>
            <div><dt className="text-[9px] uppercase tracking-[0.12em] text-[rgba(244,241,233,0.4)]">{t("admin.porras.col.pot")}</dt><dd className="text-right text-[var(--gold)]">{p.pot}</dd></div>
            {p.sla_minutes !== null && (
              <div><dt className="text-[9px] uppercase tracking-[0.12em] text-[rgba(244,241,233,0.4)]">{t("admin.porras.col.sla")}</dt>
                <dd className="text-right" style={{ color: p.sla_minutes <= 60 ? "var(--win)" : p.sla_minutes <= 1440 ? "var(--gold)" : "var(--red)" }}>
                  {t("admin.porras.slaMin", { n: String(p.sla_minutes) })}
                </dd></div>
            )}
          </dl>
          {p.status === "open" && !editing && (
            <div className="flex shrink-0 flex-wrap gap-1.5">
              <button onClick={() => start(p, "resolve")} disabled={busy}
                className="rounded-[10px] bg-[var(--win)] px-3 py-1.5 text-[12px] font-black text-[#060b09] disabled:opacity-50">
                {t("admin.porras.resolve")}
              </button>
              <button onClick={() => start(p, "void")} disabled={busy}
                className="rounded-[10px] border border-[rgba(255,194,61,0.5)] px-3 py-1.5 text-[12px] font-bold text-[var(--gold)] disabled:opacity-50">
                {t("admin.porras.void")}
              </button>
              <button onClick={() => start(p, "extend")} disabled={busy}
                className="rounded-[10px] border border-[rgba(244,241,233,0.2)] px-3 py-1.5 text-[12px] font-bold text-[rgba(244,241,233,0.6)] disabled:opacity-50">
                {t("admin.porras.extend")}
              </button>
            </div>
          )}
        </div>

        {editing === "resolve" && (
          <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-[rgba(31,224,122,0.28)] bg-[rgba(31,224,122,0.05)] p-3">
            <span className="text-[12px] font-bold text-[var(--cream)]">{t("admin.porras.pickWinner")}</span>
            {p.options.map((o) => (
              <button key={o.id} onClick={() => setChosen(o.id)} aria-pressed={chosen === o.id}
                className="rounded-[10px] border px-3 py-1.5 text-[12px] font-bold"
                style={{ borderColor: chosen === o.id ? "var(--win)" : "rgba(244,241,233,0.2)", color: chosen === o.id ? "var(--win)" : "rgba(244,241,233,0.7)" }}>
                {o.label}
              </button>
            ))}
            <button onClick={() => resolve(p)} disabled={busy || !chosen}
              className="rounded-[10px] bg-[var(--win)] px-3 py-1.5 text-[12px] font-black text-[#060b09] disabled:opacity-40">
              {t("admin.porras.confirm")}
            </button>
            <button onClick={() => setMode(null)} className="text-[12px] font-bold text-[rgba(244,241,233,0.5)] underline">{t("admin.porras.cancel")}</button>
          </div>
        )}
        {editing === "void" && (
          <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-[rgba(255,194,61,0.35)] bg-[rgba(255,194,61,0.05)] p-3">
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} placeholder={t("admin.porras.voidPh")}
              className="min-w-[220px] flex-1 rounded-[10px] border border-[rgba(244,241,233,0.2)] bg-[rgba(12,21,18,0.6)] px-3 py-1.5 text-[12px] text-[var(--cream)] outline-none focus:border-[var(--gold)]" />
            <button onClick={() => voidIt(p)} disabled={busy}
              className="rounded-[10px] border border-[var(--gold)] px-3 py-1.5 text-[12px] font-black text-[var(--gold)] disabled:opacity-40">
              {t("admin.porras.confirm")}
            </button>
            <button onClick={() => setMode(null)} className="text-[12px] font-bold text-[rgba(244,241,233,0.5)] underline">{t("admin.porras.cancel")}</button>
          </div>
        )}
        {editing === "extend" && (
          <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-[rgba(244,241,233,0.15)] p-3">
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
              className="rounded-[10px] border border-[rgba(244,241,233,0.2)] bg-[rgba(12,21,18,0.6)] px-3 py-1.5 text-[12px] text-[var(--cream)] outline-none focus:border-[var(--win)]" />
            <button onClick={() => extend(p)} disabled={busy || !when}
              className="rounded-[10px] bg-[var(--win)] px-3 py-1.5 text-[12px] font-black text-[#060b09] disabled:opacity-40">
              {t("admin.porras.save")}
            </button>
            <button onClick={() => setMode(null)} className="text-[12px] font-bold text-[rgba(244,241,233,0.5)] underline">{t("admin.porras.cancel")}</button>
          </div>
        )}
      </li>
    );
  }

  // Impugnada: motivos + Mantener / Rectificar (elegir ganadora) / Reabrir.
  function filaDisputa(d: AdminDispute) {
    const editing = rectify === d.id;
    return (
      <li key={d.id} className="flex flex-col gap-2.5 border-b border-[rgba(244,241,233,0.08)] py-3 last:border-0">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5">
          <div className="min-w-[200px] flex-1">
            <Link href={`/p/${d.slug}`} target="_blank" className="font-bold text-[var(--cream)] hover:text-[var(--win)]">{d.title}</Link>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Chip tone="muted">{t(`admin.porras.source.${d.source}`)}</Chip>
              <Chip tone="gold">{t("admin.porras.status.disputed")}</Chip>
              {d.judge && <span className="text-[11px] text-[rgba(244,241,233,0.6)]">{t("admin.porras.judge")}: <b className="text-[var(--cream)]">@{d.judge}</b></span>}
              {d.winning_label && <span className="text-[11px] text-[rgba(244,241,233,0.6)]">{t("admin.porras.current")}: <b className="text-[var(--gold)]">{d.winning_label}</b></span>}
            </div>
            <p className="mono mt-1 text-[11px] text-[rgba(244,241,233,0.55)]">
              {t("admin.porras.disputesN", { n: String(d.disputes.length), m: String(d.threshold), p: String(d.participants) })}
              {d.disputed_at && <> · {fmt.format(new Date(d.disputed_at))}</>}
            </p>
          </div>
          <dl className="mono flex shrink-0 gap-4 text-[12px] text-[rgba(244,241,233,0.7)]">
            <div><dt className="text-[9px] uppercase tracking-[0.12em] text-[rgba(244,241,233,0.4)]">{t("admin.porras.col.closes")}</dt><dd>{fmt.format(new Date(d.closes_at))}</dd></div>
            <div><dt className="text-[9px] uppercase tracking-[0.12em] text-[rgba(244,241,233,0.4)]">{t("admin.porras.col.pot")}</dt><dd className="text-right text-[var(--gold)]">{d.pot}</dd></div>
          </dl>
        </div>

        <ul className="flex flex-col gap-1 rounded-[12px] border border-[rgba(255,194,61,0.25)] bg-[rgba(255,194,61,0.04)] px-3 py-2">
          {d.disputes.map((x, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
              <span className="font-bold text-[var(--cream)]">@{x.handle}</span>
              <span className="text-[rgba(244,241,233,0.75)]">{x.reason || t("admin.porras.noReason")}</span>
              <span className="mono ml-auto text-[10px] text-[rgba(244,241,233,0.4)]">{fmt.format(new Date(x.created_at))}</span>
            </li>
          ))}
        </ul>

        {!editing ? (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => decide(d, "uphold", null)} disabled={busy}
              className="rounded-[10px] bg-[var(--win)] px-3 py-1.5 text-[12px] font-black text-[#060b09] disabled:opacity-50">
              {t("admin.porras.keep")}
            </button>
            <button onClick={() => { setRectify(d.id); setNewWin(null); setMsg(null); }} disabled={busy}
              className="rounded-[10px] border border-[var(--gold)] px-3 py-1.5 text-[12px] font-black text-[var(--gold)] disabled:opacity-50">
              {t("admin.porras.rectify")}
            </button>
            <button onClick={() => decide(d, "reverse", null)} disabled={busy}
              className="rounded-[10px] border border-[rgba(244,241,233,0.2)] px-3 py-1.5 text-[12px] font-bold text-[rgba(244,241,233,0.6)] disabled:opacity-50">
              {t("admin.porras.reopen")}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-[rgba(255,194,61,0.35)] bg-[rgba(255,194,61,0.05)] p-3">
            <span className="text-[12px] font-bold text-[var(--cream)]">{t("admin.porras.rectifyPick")}</span>
            {d.options.map((o) => {
              const on = newWin === o.id;
              const current = o.id === d.winning_option_id;
              return (
                <button key={o.id} onClick={() => setNewWin(o.id)} aria-pressed={on} disabled={busy}
                  className="rounded-[10px] border px-3 py-1.5 text-[12px] font-bold disabled:opacity-50"
                  style={{ borderColor: on ? "var(--gold)" : "rgba(244,241,233,0.2)", color: on ? "var(--gold)" : current ? "rgba(244,241,233,0.4)" : "rgba(244,241,233,0.7)" }}>
                  {o.label}{current ? " ·" : ""}
                </button>
              );
            })}
            <button onClick={() => decide(d, "reverse", newWin)} disabled={busy || !newWin}
              className="rounded-[10px] bg-[var(--gold)] px-3 py-1.5 text-[12px] font-black text-[#060b09] disabled:opacity-40">
              {t("admin.porras.rectifyConfirm")}
            </button>
            <button onClick={() => { setRectify(null); setNewWin(null); }} className="text-[12px] font-bold text-[rgba(244,241,233,0.5)] underline">{t("admin.porras.cancel")}</button>
          </div>
        )}
      </li>
    );
  }

  function seccion(title: string, rows: AdminPorra[], glow: "win" | "gold" | "none") {
    return (
      <div key={title} className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-[var(--cream)]">{title}</h2>
          <span className="mono text-[12px] text-[rgba(244,241,233,0.5)]">{rows.length}</span>
        </div>
        <GlassCard glow={glow}>
          {rows.length === 0 ? (
            <p className="text-sm text-[rgba(244,241,233,0.5)]">{t("admin.porras.empty")}</p>
          ) : (
            <ul className="flex flex-col">{rows.map((p) => fila(p))}</ul>
          )}
        </GlassCard>
      </div>
    );
  }

  return (
    <>
      {stuck.length > 0 && (
        <div><Chip tone="gold">{t("admin.porras.stuck", { n: String(stuckPot), m: String(stuck.length) })}</Chip></div>
      )}
      {msg && (
        <p className={`text-sm font-bold ${msg.kind === "ok" ? "text-[var(--win)]" : "text-[var(--red)]"}`}>{msg.text}</p>
      )}

      {/* IMPUGNADAS: reparto congelado hasta que el admin decida */}
      {disputes.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-[var(--gold)]">{t("admin.porras.disputed")}</h2>
            <span className="mono text-[12px] text-[rgba(244,241,233,0.5)]">{disputes.length}</span>
          </div>
          <p className="-mt-2 text-[12px] text-[rgba(244,241,233,0.5)]">{t("admin.porras.disputedHow")}</p>
          <GlassCard glow="gold">
            <ul className="flex flex-col">{disputes.map((d) => filaDisputa(d))}</ul>
          </GlassCard>
        </div>
      )}

      {seccion(t("admin.porras.closedUnresolved"), stuck, "gold")}
      {seccion(t("admin.porras.open"), open, "win")}
      {seccion(t("admin.porras.finished"), done, "none")}

      {/* PIQUE DEL DÍA sin resolver */}
      <div className="mt-2 flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-[var(--cream)]">{t("admin.porras.daily.title")}</h2>
        <span className="mono text-[12px] text-[rgba(244,241,233,0.5)]">{daily.length}</span>
      </div>
      <p className="-mt-3 text-[12px] text-[rgba(244,241,233,0.5)]">{t("admin.porras.daily.how")}</p>
      {daily.length === 0 ? (
        <GlassCard glow="none"><p className="text-sm text-[rgba(244,241,233,0.5)]">{t("admin.porras.daily.empty")}</p></GlassCard>
      ) : (
        <div className="flex flex-col gap-3">
          {daily.map((d) => (
            <GlassCard key={d.id} glow="gold">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[200px] flex-1">
                  <div className="mono text-[10px] uppercase tracking-[0.12em] text-[rgba(244,241,233,0.45)]">{d.scheduled_for}</div>
                  <div className="font-bold text-[var(--cream)]">{d.question}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {d.options.map((o, i) => (
                    <button key={i} onClick={() => resolveDaily(d, i)} disabled={busy}
                      className="rounded-[10px] border border-[var(--gold)] px-3 py-1.5 text-[12px] font-black text-[var(--gold)] hover:bg-[rgba(255,194,61,0.12)] disabled:opacity-50">
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </>
  );
}
