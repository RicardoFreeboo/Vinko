"use client";
import { useState } from "react";
import Link from "next/link";
import { VMark } from "@/components/Logo";
import { t } from "@/lib/i18n";

// Rejilla de perfil estilo Instagram: pestañas (creadas / jugadas), 3 columnas
// cuadradas a sangre y con separación mínima. Sin texto encima: la miniatura
// manda, y el scroll es continuo aunque haya muchas porras.
export type Row = {
  id: string; slug: string; title: string; status: string; media_url?: string | null; video?: string | null;
};

function Grid({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) return <p className="px-5 py-8 text-center text-sm text-[var(--muted)]">{empty}</p>;
  return (
    <div className="-mx-5 grid grid-cols-3 gap-[2px]">
      {rows.map((r) => {
        const v = r.media_url ?? r.video ?? null;
        return (
          <Link key={r.id} href={`/p/${r.slug}`}
            className="relative aspect-square overflow-hidden bg-[var(--ink3)]">
            {v ? (
              <video src={v} muted loop playsInline preload="metadata" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[var(--ink2)] to-[var(--ink3)]">
                <VMark size={26} />
              </div>
            )}
            {r.status === "resolved" && (
              <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/55 text-[11px] text-[var(--win)] backdrop-blur">✓</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

export function ProfileGrid({ created, played }: { created: Row[]; played: Row[] }) {
  const [tab, setTab] = useState<"created" | "played">(created.length ? "created" : "played");
  const tabs = [
    { k: "created" as const, label: t("u.created"), n: created.length },
    { k: "played" as const, label: t("u.played"), n: played.length },
  ];
  return (
    <section className="flex flex-col">
      {/* pestañas, como en Instagram */}
      <div className="-mx-5 flex border-y border-[var(--line)]">
        {tabs.map((x) => {
          const on = tab === x.k;
          return (
            <button key={x.k} onClick={() => setTab(x.k)}
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5 transition-colors"
              style={{
                color: on ? "var(--cream)" : "var(--muted)",
                borderBottom: on ? "2px solid var(--win)" : "2px solid transparent",
              }}>
              <span className="text-[13px] font-black">{x.n}</span>
              <span className="text-[10px] uppercase tracking-wide">{x.label}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-[2px]">
        {tab === "created"
          ? <Grid rows={created} empty={t("u.noCreated")} />
          : <Grid rows={played} empty={t("u.noPlayed")} />}
      </div>
    </section>
  );
}
