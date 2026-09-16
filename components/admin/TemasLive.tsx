"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GlassCard, ScoreRing, Chip } from "@/components/backstage/ui";
import { t } from "@/lib/i18n";

type Proposal = {
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
};

const FLAG_TONE: Record<string, "red" | "gold" | "muted"> = {
  lexico: "red", cuotas: "red", invalida: "red", seguridad: "red",
  sin_resolucion: "gold", pregunta: "gold", opciones: "gold",
  sin_haiku: "muted",
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
  const texto = norm([p.title, ...(p.options ?? []), p.category ?? ""].join(" "));
  return palabras.every((w) => texto.includes(w));
}

export function TemasLive({ initial }: { initial: Proposal[] }) {
  const router = useRouter();
  const [list, setList] = useState<Proposal[]>(initial);
  // BUG corregido: useState ignora el nuevo `initial` tras router.refresh(), así
  // que las porras recién generadas NO aparecían hasta recargar la página.
  useEffect(() => { setList(initial); }, [initial]);

  const [topic, setTopic] = useState("");
  const [filtro, setFiltro] = useState("");
  const [busy, setBusy] = useState<null | "sweep" | "renew" | "search">(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const pendientes = useMemo(() => list.filter((p) => p.status === "pending_review" && casa(p, filtro)), [list, filtro]);
  const publicadas = useMemo(() => list.filter((p) => p.status === "published" && casa(p, filtro)), [list, filtro]);

  async function runAgent(modo: "sweep" | "renew" | "search") {
    const tema = topic.trim();
    if (modo === "search" && !tema) return;
    setBusy(modo); setMsg(null);
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
      router.refresh();
    } catch {
      setMsg({ kind: "err", text: t("admin.temas.agentErr") });
    } finally {
      setBusy(null);
    }
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
      const em = String(j.error ?? "");
      const m = em.includes("VINKO_UNSAFE") ? t("admin.temas.unsafe")
        : em.includes("NO_RESOLUTION") ? t("admin.temas.needCriteria")
        : t("admin.temas.agentErr");
      setMsg({ kind: "err", text: m });
    }
  }

  async function discard(p: Proposal) {
    await fetch("/api/admin/proposal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "discard", id: p.id }),
    });
    setList((l) => l.filter((x) => x.id !== p.id));
  }

  function Tarjeta({ p }: { p: Proposal }) {
    const pendiente = p.status === "pending_review";
    return (
      <GlassCard glow={p.flags?.some((f) => FLAG_TONE[f] === "red") ? "gold" : pendiente ? "win" : "none"}>
        <div className="flex items-start gap-3">
          <ScoreRing score={p.score} />
          <div className="min-w-0 flex-1">
            <div className="font-bold text-[var(--cream)]">{p.title}</div>
            <div className="mt-1 flex flex-wrap gap-1.5 text-[12px] text-[rgba(244,241,233,0.6)]">
              {(p.options ?? []).map((o, i) => (
                <span key={i} className="rounded-[6px] border border-[rgba(31,224,122,0.2)] px-1.5 py-0.5">{o}</span>
              ))}
            </div>
            {p.resolution_criteria && (
              <div className="mt-1.5 text-[11px] text-[rgba(244,241,233,0.45)]">
                {t("admin.temas.criteria")}: {p.resolution_criteria}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.category && <Chip tone="muted">{p.category}</Chip>}
              {(p.flags ?? []).map((f) => (
                <Chip key={f} tone={FLAG_TONE[f] ?? "muted"}>{t(`admin.temas.flag.${f}`) || f}</Chip>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            {pendiente ? (
              <>
                <button onClick={() => approve(p)}
                  className="rounded-[10px] bg-[var(--win)] px-3 py-1.5 text-[12px] font-black text-[#060b09]">
                  {t("admin.temas.publish")}
                </button>
                <button onClick={() => discard(p)}
                  className="rounded-[10px] border border-[rgba(244,241,233,0.2)] px-3 py-1.5 text-[12px] font-bold text-[rgba(244,241,233,0.6)]">
                  {t("admin.temas.discard")}
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

      {/* PUBLICADAS — se quedan visibles aunque el cron ya las haya publicado */}
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
