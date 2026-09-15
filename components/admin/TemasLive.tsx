"use client";
import { useState } from "react";
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

export function TemasLive({ initial }: { initial: Proposal[] }) {
  const router = useRouter();
  const [list, setList] = useState<Proposal[]>(initial);
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState<null | "sweep" | "search">(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function runAgent(withTopic: boolean) {
    if (withTopic && !topic.trim()) return;
    setBusy(withTopic ? "search" : "sweep"); setMsg(null);
    try {
      const res = await fetch("/api/admin/trend", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withTopic ? { topic: topic.trim() } : {}),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) setMsg({ kind: "err", text: t("admin.temas.needAdmin") });
      else if (j.cooldown) setMsg({ kind: "err", text: t("admin.temas.cooldown") });
      else if (typeof j.created === "number") {
        setMsg({ kind: "ok", text: t("admin.temas.generated", { n: String(j.created) }) });
        setTopic("");
        router.refresh();
      } else setMsg({ kind: "err", text: t("admin.temas.agentErr") });
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
      setList((l) => l.filter((x) => x.id !== p.id));
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

  return (
    <>
      {/* controles: barrido + buscador de tema (§C/§D) */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button onClick={() => runAgent(false)} disabled={busy !== null}
          className="rounded-[12px] bg-[var(--win)] px-4 py-2.5 text-sm font-black text-[#060b09] disabled:opacity-50">
          {busy === "sweep" ? t("admin.temas.searching") : t("admin.temas.refresh")}
        </button>
        <div className="flex flex-1 gap-2">
          <input value={topic} onChange={(e) => setTopic(e.target.value)}
            placeholder={t("admin.temas.searchPh")}
            className="flex-1 rounded-[12px] border border-[rgba(31,224,122,0.25)] bg-[rgba(12,21,18,0.6)] px-3 py-2.5 text-sm text-[var(--cream)] outline-none focus:border-[var(--win)]" />
          <button onClick={() => runAgent(true)} disabled={busy !== null || !topic.trim()}
            className="rounded-[12px] border border-[var(--gold)] px-4 py-2.5 text-sm font-black text-[var(--gold)] disabled:opacity-40">
            {busy === "search" ? t("admin.temas.searching") : t("admin.temas.searchBtn")}
          </button>
        </div>
      </div>
      {msg && (
        <p className={`text-sm font-bold ${msg.kind === "ok" ? "text-[var(--win)]" : "text-[var(--red)]"}`}>{msg.text}</p>
      )}

      {list.length === 0 ? (
        <GlassCard glow="none">
          <p className="text-sm text-[rgba(244,241,233,0.5)]">{t("admin.temas.emptyQueue")}</p>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((p) => (
            <GlassCard key={p.id} glow={p.flags?.some((f) => FLAG_TONE[f] === "red") ? "gold" : "win"}>
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
                  <button onClick={() => approve(p)}
                    className="rounded-[10px] bg-[var(--win)] px-3 py-1.5 text-[12px] font-black text-[#060b09]">
                    {t("admin.temas.publish")}
                  </button>
                  <button onClick={() => discard(p)}
                    className="rounded-[10px] border border-[rgba(244,241,233,0.2)] px-3 py-1.5 text-[12px] font-bold text-[rgba(244,241,233,0.6)]">
                    {t("admin.temas.discard")}
                  </button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </>
  );
}
