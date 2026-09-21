"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { GlassCard, ScoreRing, Chip } from "@/components/backstage/ui";
import { t } from "@/lib/i18n";

// Cola del agente de tendencias. El agente v3 propone; aquí se ve la noticia
// origen, se EDITA (pregunta, opciones, cierre, criterio → update_proposal),
// se publica (publish_proposal) o se descarta (reject_proposal). Nada se
// publica solo.
export type Proposal = {
  id: string;
  title: string;
  options: string[];
  category: string | null;
  resolution_criteria: string | null;
  closes_at: string | null;
  score: number | null;
  flags: string[];
  kind: string;
  status: "pending_review" | "published";
  slug: string | null;
  source_url?: string | null;
  source_title?: string | null;
  updated_at?: string | null;
};

const FLAG_TONE: Record<string, "red" | "gold" | "muted"> = {
  lexico: "red", cuotas: "red", invalida: "red", seguridad: "red", menores: "red", politica: "red",
  ya_ocurrido: "gold", sin_fecha: "gold", fecha_pasada: "gold", repetida: "gold",
  sin_resolucion: "gold", pregunta: "gold", opciones: "gold", lejana: "gold",
  sin_haiku: "muted", sin_hora: "muted",
};

function slugify(title: string): string {
  const base = title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  const rnd = Math.abs(base.length * 7 + title.length * 13) % 9000 + 1000;
  return ((base.length >= 3 ? base : "porra") + "-" + rnd).slice(0, 80);
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Coincide si TODAS las palabras del filtro aparecen en la pregunta o opciones.
function casa(p: Proposal, filtro: string): boolean {
  const palabras = norm(filtro).split(/\s+/).filter((w) => w.length > 2);
  if (!palabras.length) return true;
  const texto = norm([p.title, ...(p.options ?? []), p.category ?? "", p.source_title ?? ""].join(" "));
  return palabras.every((w) => texto.includes(w));
}

function fechaES(iso: string | null): string {
  if (!iso) return t("admin.temas.noCloses");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t("admin.temas.noCloses");
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
  }).format(d);
}
// ISO → valor de <input type="datetime-local"> en hora local del navegador.
function aLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function flagLabel(f: string): string {
  const k = `admin.temas.flag.${f}`;
  const v = t(k);
  return v === k ? f : v;
}
function resumen(m: Record<string, number> | undefined): string {
  if (!m) return "";
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${flagLabel(k)} ${n}`).join(" · ");
}

type Draft = { title: string; options: string; closes: string; criteria: string };

export function TemasLive({ initial }: { initial: Proposal[] }) {
  const router = useRouter();
  const [list, setList] = useState<Proposal[]>(initial);
  // useState ignora el nuevo `initial` tras router.refresh(): sin esto las
  // porras recién generadas no aparecían hasta recargar la página.
  useEffect(() => { setList(initial); }, [initial]);

  const [topic, setTopic] = useState("");
  const [filtro, setFiltro] = useState("");
  const [busy, setBusy] = useState<null | "sweep" | "renew" | "search">(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [detalle, setDetalle] = useState<string[]>([]);
  const [editing, setEditing] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const pendientes = useMemo(() => list.filter((p) => p.status === "pending_review" && casa(p, filtro)), [list, filtro]);
  const publicadas = useMemo(() => list.filter((p) => p.status === "published" && casa(p, filtro)), [list, filtro]);

  async function runAgent(modo: "sweep" | "renew" | "search") {
    const tema = topic.trim();
    if (modo === "search" && !tema) return;
    setBusy(modo); setMsg(null); setDetalle([]);
    try {
      const res = await fetch("/api/admin/trend", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modo === "search" ? { topic: tema } : { force: modo === "renew" }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) { setMsg({ kind: "err", text: t("admin.temas.needAdmin") }); return; }
      if (j.cooldown) { setMsg({ kind: "err", text: t("admin.temas.cooldown") }); return; }
      if (typeof j.created !== "number") { setMsg({ kind: "err", text: t("admin.temas.agentErr") }); return; }

      // Al buscar un tema, el filtro SE QUEDA: aunque no salgan nuevas, ves las
      // que ya había sobre ese tema (pendientes y publicadas).
      if (modo === "search") setFiltro(tema);
      const n = String(j.created);
      if (j.created > 0) {
        setMsg({ kind: "ok", text: t("admin.temas.generated", { n }) });
      } else if (modo === "search") {
        setMsg({ kind: "ok", text: t("admin.temas.noneNewTopic", { tema }) });
      } else {
        setMsg({ kind: "ok", text: t(modo === "renew" ? "admin.temas.noneNewRenew" : "admin.temas.noneNew") });
      }
      // Transparencia: por qué el filtro tiró lo que tiró.
      const d: string[] = [];
      const desc = Number(j.descartadas ?? 0) + Number(j.repetidas ?? 0);
      if (desc > 0) d.push(t("admin.temas.discardSummary", { n: String(desc), detalle: resumen(j.motivos) }));
      if (j.ingesta_descartes && Object.keys(j.ingesta_descartes).length) {
        d.push(t("admin.temas.ingestSummary", { n: String(j.ingested ?? 0), detalle: resumen(j.ingesta_descartes) }));
      }
      setDetalle(d);
      router.refresh();
    } catch {
      setMsg({ kind: "err", text: t("admin.temas.agentErr") });
    } finally {
      setBusy(null);
    }
  }

  function errorMsg(em: string): string {
    if (em.includes("VINKO_UNSAFE")) return t("admin.temas.unsafe");
    if (em.includes("VINKO_MENOR")) return t("admin.temas.minor");
    if (em.includes("NO_RESOLUTION")) return t("admin.temas.needCriteria");
    if (/BAD_TITLE|BAD_OPTIONS|BAD_DATE/.test(em)) return t("admin.temas.badEdit");
    if (/does not exist|schema cache/i.test(em)) return t("admin.temas.pendingMigration");
    return t("admin.temas.agentErr");
  }

  async function approve(p: Proposal) {
    const res = await fetch("/api/admin/proposal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish", id: p.id, slug: slugify(p.title) }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.ok) {
      // se queda en pantalla, pasa a la sección de publicadas
      setList((l) => l.map((x) => (x.id === p.id ? { ...x, status: "published" } : x)));
      setMsg({ kind: "ok", text: t("admin.temas.approved") });
      router.refresh();
    } else {
      setMsg({ kind: "err", text: errorMsg(String(j.error ?? "")) });
    }
  }

  async function discard(p: Proposal) {
    const sb = supabaseBrowser();
    let ok = false;
    if (sb) {
      const { error } = await sb.rpc("reject_proposal", { p_id: p.id });
      ok = !error;
      // Migración 0032 aún sin aplicar: ruta antigua (update directo).
      if (error && !/does not exist|schema cache/i.test(error.message)) { setMsg({ kind: "err", text: errorMsg(error.message) }); return; }
    }
    if (!ok) {
      const res = await fetch("/api/admin/proposal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discard", id: p.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!(res.ok && j.ok)) { setMsg({ kind: "err", text: t("admin.temas.agentErr") }); return; }
    }
    setList((l) => l.filter((x) => x.id !== p.id));
  }

  function startEdit(p: Proposal) {
    setEditing((m) => ({
      ...m,
      [p.id]: { title: p.title, options: (p.options ?? []).join("\n"), closes: aLocal(p.closes_at), criteria: p.resolution_criteria ?? "" },
    }));
  }
  function cancelEdit(id: string) {
    setEditing((m) => { const c = { ...m }; delete c[id]; return c; });
  }
  async function save(p: Proposal) {
    const d = editing[p.id];
    if (!d) return;
    const title = d.title.trim();
    const options = d.options.split("\n").map((o) => o.trim()).filter(Boolean);
    const closesTs = d.closes ? new Date(d.closes).getTime() : NaN;
    const distintas = new Set(options.map(norm)).size === options.length;
    if (title.length < 8 || title.length > 140 || options.length < 2 || options.length > 6 || !distintas
      || Number.isNaN(closesTs) || closesTs < Date.now() + 3600_000 || d.criteria.trim().length < 5) {
      setMsg({ kind: "err", text: t("admin.temas.badEdit") }); return;
    }
    const sb = supabaseBrowser();
    if (!sb) { setMsg({ kind: "err", text: t("admin.temas.agentErr") }); return; }
    setSaving(p.id); setMsg(null);
    const closes_at = new Date(closesTs).toISOString();
    const { error } = await sb.rpc("update_proposal", {
      p_id: p.id, p_title: title, p_options: options, p_closes_at: closes_at, p_criteria: d.criteria.trim(),
    });
    setSaving(null);
    if (error) { setMsg({ kind: "err", text: errorMsg(error.message) }); return; }
    setList((l) => l.map((x) => (x.id === p.id
      ? { ...x, title, options, closes_at, resolution_criteria: d.criteria.trim(), updated_at: new Date().toISOString() }
      : x)));
    cancelEdit(p.id);
    setMsg({ kind: "ok", text: t("admin.temas.saved") });
    router.refresh();
  }

  const input = "w-full rounded-[10px] border border-[rgba(31,224,122,0.25)] bg-[rgba(12,21,18,0.6)] px-3 py-2 text-[13px] text-[var(--cream)] outline-none focus:border-[var(--win)]";
  const lbl = "text-[11px] font-bold uppercase tracking-wide text-[rgba(244,241,233,0.5)]";

  function Tarjeta({ p }: { p: Proposal }) {
    const pendiente = p.status === "pending_review";
    const d = editing[p.id];
    const rojo = p.flags?.some((f) => FLAG_TONE[f] === "red");
    return (
      <GlassCard glow={rojo ? "gold" : pendiente ? "win" : "none"}>
        <div className="flex items-start gap-3">
          <ScoreRing score={p.score} />
          <div className="min-w-0 flex-1">
            {!d && <div className="font-bold text-[var(--cream)]">{p.title}</div>}
            {!d && (
              <div className="mt-1 flex flex-wrap gap-1.5 text-[12px] text-[rgba(244,241,233,0.6)]">
                {(p.options ?? []).map((o, i) => (
                  <span key={i} className="rounded-[6px] border border-[rgba(31,224,122,0.2)] px-1.5 py-0.5">{o}</span>
                ))}
              </div>
            )}
            {!d && p.resolution_criteria && (
              <div className="mt-1.5 text-[11px] text-[rgba(244,241,233,0.45)]">
                {t("admin.temas.criteria")}: {p.resolution_criteria}
              </div>
            )}
            {!d && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[rgba(244,241,233,0.5)]">
                <span><span className="text-[rgba(244,241,233,0.35)]">{t("admin.temas.closes")}:</span> <span className="mono text-[var(--cream)]">{fechaES(p.closes_at)}</span></span>
                {(p.source_title || p.source_url) && (
                  <span className="min-w-0">
                    <span className="text-[rgba(244,241,233,0.35)]">{t("admin.temas.sourceLbl")}:</span>{" "}
                    {p.source_title && <span className="italic">«{p.source_title}»</span>}{" "}
                    {p.source_url && (
                      <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--gold)] underline">
                        {t("admin.temas.openSource")}
                      </a>
                    )}
                  </span>
                )}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.category && <Chip tone="muted">{p.category}</Chip>}
              {p.updated_at && <Chip tone="gold">{t("admin.temas.edited")}</Chip>}
              {(p.flags ?? []).map((f) => (
                <Chip key={f} tone={FLAG_TONE[f] ?? "muted"}>{flagLabel(f)}</Chip>
              ))}
            </div>

            {d && (
              <div className="flex flex-col gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className={lbl}>{t("admin.temas.fTitle")}</span>
                  <input value={d.title} maxLength={140}
                    onChange={(ev) => setEditing((m) => ({ ...m, [p.id]: { ...d, title: ev.target.value } }))} className={input} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={lbl}>{t("admin.temas.fOptions")}</span>
                  <textarea value={d.options} rows={Math.min(6, Math.max(2, d.options.split("\n").length))}
                    onChange={(ev) => setEditing((m) => ({ ...m, [p.id]: { ...d, options: ev.target.value } }))} className={input} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={lbl}>{t("admin.temas.fCloses")}</span>
                  <input type="datetime-local" value={d.closes}
                    onChange={(ev) => setEditing((m) => ({ ...m, [p.id]: { ...d, closes: ev.target.value } }))} className={`${input} mono`} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={lbl}>{t("admin.temas.fCriteria")}</span>
                  <textarea value={d.criteria} rows={2}
                    onChange={(ev) => setEditing((m) => ({ ...m, [p.id]: { ...d, criteria: ev.target.value } }))} className={input} />
                </label>
                <p className="text-[11px] leading-snug text-[rgba(244,241,233,0.4)]">{t("admin.temas.editHint")}</p>
                <div className="flex gap-2">
                  <button onClick={() => save(p)} disabled={saving === p.id}
                    className="rounded-[10px] bg-[var(--win)] px-3 py-1.5 text-[12px] font-black text-[#060b09] disabled:opacity-50">
                    {t("admin.temas.save")}
                  </button>
                  <button onClick={() => cancelEdit(p.id)} disabled={saving === p.id}
                    className="rounded-[10px] border border-[rgba(244,241,233,0.2)] px-3 py-1.5 text-[12px] font-bold text-[rgba(244,241,233,0.6)]">
                    {t("admin.temas.cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            {pendiente ? (
              <>
                <button onClick={() => approve(p)} disabled={!!d}
                  className="rounded-[10px] bg-[var(--win)] px-3 py-1.5 text-[12px] font-black text-[#060b09] disabled:opacity-40">
                  {t("admin.temas.publish")}
                </button>
                {!d && (
                  <button onClick={() => startEdit(p)}
                    className="rounded-[10px] border border-[var(--gold)] px-3 py-1.5 text-[12px] font-black text-[var(--gold)]">
                    {t("admin.temas.edit")}
                  </button>
                )}
                <button onClick={() => discard(p)} disabled={!!d}
                  className="rounded-[10px] border border-[rgba(244,241,233,0.2)] px-3 py-1.5 text-[12px] font-bold text-[rgba(244,241,233,0.6)] disabled:opacity-40">
                  {t("admin.temas.reject")}
                </button>
              </>
            ) : (
              <>
                <span className="rounded-[10px] border border-[rgba(31,224,122,0.35)] px-3 py-1.5 text-center text-[12px] font-bold text-[var(--win)]">
                  {t("admin.temas.approved")}
                </span>
                {p.slug && (
                  <Link href={`/p/${p.slug}`} target="_blank"
                    className="text-center text-[11px] font-bold text-[rgba(244,241,233,0.6)] underline">
                    {t("admin.temas.view")}
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      </GlassCard>
    );
  }

  return (
    <>
      {/* controles: barrido · renovar · buscador de tema */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => runAgent("sweep")} disabled={busy !== null}
            className="rounded-[12px] bg-[var(--win)] px-4 py-2.5 text-sm font-black text-[#060b09] disabled:opacity-50">
            {busy === "sweep" ? t("admin.temas.searching") : t("admin.temas.refresh")}
          </button>
          <button onClick={() => runAgent("renew")} disabled={busy !== null} title={t("admin.temas.renewHint")}
            className="rounded-[12px] border border-[var(--win)] px-4 py-2.5 text-sm font-black text-[var(--win)] disabled:opacity-50">
            {busy === "renew" ? t("admin.temas.searching") : t("admin.temas.renew")}
          </button>
        </div>
        <div className="flex gap-2">
          <input value={topic} onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runAgent("search"); }}
            placeholder={t("admin.temas.searchPh")}
            className="flex-1 rounded-[12px] border border-[rgba(31,224,122,0.25)] bg-[rgba(12,21,18,0.6)] px-3 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
          <button onClick={() => runAgent("search")} disabled={busy !== null || !topic.trim()}
            className="rounded-[12px] border border-[var(--gold)] px-4 py-2.5 text-sm font-black text-[var(--gold)] disabled:opacity-40">
            {busy === "search" ? t("admin.temas.searching") : t("admin.temas.searchBtn")}
          </button>
        </div>
      </div>

      {msg && (
        <p className={`text-sm font-bold ${msg.kind === "ok" ? "text-[var(--win)]" : "text-[var(--red)]"}`}>{msg.text}</p>
      )}
      {detalle.length > 0 && (
        <div className="flex flex-col gap-1">
          {detalle.map((d, i) => <p key={i} className="text-[12px] leading-snug text-[rgba(244,241,233,0.5)]">{d}</p>)}
        </div>
      )}

      {filtro && (
        <div className="flex items-center gap-2">
          <Chip tone="gold">{t("admin.temas.filtering", { tema: filtro })}</Chip>
          <button onClick={() => setFiltro("")}
            className="text-[12px] font-bold text-[rgba(244,241,233,0.6)] underline">
            {t("admin.temas.clearFilter")}
          </button>
        </div>
      )}

      {/* PENDIENTES */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-[var(--cream)]">{t("admin.temas.pending")}</h2>
        <span className="mono text-[12px] text-[rgba(244,241,233,0.5)]">{pendientes.length}</span>
      </div>
      {pendientes.length === 0 ? (
        <GlassCard glow="none">
          <p className="text-sm text-[rgba(244,241,233,0.5)]">
            {filtro ? t("admin.temas.emptyFiltered") : t("admin.temas.emptyQueue")}
          </p>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-3">{pendientes.map((p) => <Tarjeta key={p.id} p={p} />)}</div>
      )}

      {/* PUBLICADAS — se quedan visibles aunque ya estén en el feed */}
      <div className="mt-2 flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-[var(--cream)]">{t("admin.temas.published")}</h2>
        <span className="mono text-[12px] text-[rgba(244,241,233,0.5)]">{publicadas.length}</span>
      </div>
      {publicadas.length === 0 ? (
        <GlassCard glow="none">
          <p className="text-sm text-[rgba(244,241,233,0.5)]">{t("admin.temas.emptyPublished")}</p>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-3">{publicadas.map((p) => <Tarjeta key={p.id} p={p} />)}</div>
      )}
    </>
  );
}
