"use client";
import { useState } from "react";

// PASO 5c — Tablero de temas editoriales / IA trending. El scraper propone;
// aquí Ricardo aprueba/tira. La demo mueve estado en cliente; con backend, cada
// acción escribe topic_proposals y "Publicar" crea la porra editorial.
type Proposal = {
  id: string;
  title: string;
  options: string[];
  source_url: string;
  cat: string;
  status: string;
};
type Published = { slug: string; title: string; cat: string; hasVideo: boolean };

export function TemasBoard({
  labels,
  proposals: initial,
  published,
}: {
  labels: Record<string, string>;
  proposals: Proposal[];
  published: Published[];
}) {
  const [rows, setRows] = useState(initial.map((p) => ({ ...p })));
  const pending = rows.filter((r) => r.status === "pending_review").length;
  const L = (k: string, v?: Record<string, string>) =>
    v ? Object.entries(v).reduce((s, [a, b]) => s.replaceAll(`{${a}}`, b), labels[k]) : labels[k];

  function set(id: string, status: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Pendientes */}
      <section className="rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow text-[11px]">{L("admin.temas.pending")}</h2>
          <span className="mono text-[11px] font-bold text-[var(--gold)]">
            {L("admin.temas.count", { n: String(pending) })}
          </span>
        </div>

        {pending === 0 ? (
          <div className="rounded-[12px] border border-dashed border-[var(--line)] px-4 py-8 text-center">
            <span className="mono text-sm text-[var(--muted)]">{L("admin.temas.emptyPending")}</span>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-[12px] border border-[var(--line)] bg-[var(--ink3)] p-3.5"
                hidden={r.status === "discarded"}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold text-[var(--cream)]">{r.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--win)]">{r.cat}</span>
                      <span className="text-[11px] text-[var(--muted2)]">· {r.source_url}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.options.map((o, i) => (
                        <span key={i} className="rounded-full border border-[var(--line)] px-2.5 py-0.5 text-[11px] text-[var(--muted)]">
                          {o}
                        </span>
                      ))}
                    </div>
                  </div>
                  {r.status === "approved" ? (
                    <span className="mono shrink-0 rounded-full border border-[var(--win)] px-2.5 py-1 text-[11px] font-bold text-[var(--win)]">
                      {L("admin.temas.approved")}
                    </span>
                  ) : (
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        onClick={() => set(r.id, "approved")}
                        className="mono rounded-full bg-[var(--win)] px-3 py-1 text-[11px] font-bold uppercase text-[var(--ink)]"
                      >
                        {L("admin.temas.publish")}
                      </button>
                      <button
                        onClick={() => set(r.id, "discarded")}
                        className="mono rounded-full border border-[var(--line)] px-3 py-1 text-[11px] font-bold uppercase text-[var(--muted)]"
                      >
                        {L("admin.temas.discard")}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Publicadas por @vinko */}
      <section className="rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] p-4">
        <h2 className="eyebrow mb-3 text-[11px]">{L("admin.temas.published")}</h2>
        <ul className="flex flex-col gap-2.5">
          {published.map((p) => (
            <li
              key={p.slug}
              className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--ink3)] p-3.5"
            >
              <div className="min-w-0">
                <div className="truncate text-[14px] font-bold text-[var(--cream)]">{p.title}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--win)]">{p.cat}</span>
                  <span
                    className={`mono text-[10px] ${p.hasVideo ? "text-[var(--win)]" : "text-[var(--gold)]"}`}
                  >
                    · {p.hasVideo ? L("admin.temas.video.ready") : L("admin.temas.video.pending")}
                  </span>
                </div>
              </div>
              <a
                href={`/p/${p.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mono shrink-0 text-[11px] font-bold text-[var(--win)]"
              >
                {L("admin.temas.view")}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-[12px] leading-relaxed text-[var(--muted)]">{L("admin.temas.live")}</p>
    </div>
  );
}
