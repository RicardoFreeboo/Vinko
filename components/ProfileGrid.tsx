"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PorraCover } from "@/components/PorraCover";
import { thumbOf } from "@/lib/thumb";
import { t } from "@/lib/i18n";

// Rejilla de perfil estilo Instagram: pestañas (creadas / jugadas), 3 columnas
// cuadradas a sangre y con separación mínima. Cada casilla es una IMAGEN fija
// (miniatura del vídeo o la foto subida), no un <video>: en el móvil un vídeo
// sin autoplay no pinta su primer fotograma y la rejilla salía negra.
export type Row = {
  id: string; slug: string; title: string; status: string;
  media_url?: string | null; media_kind?: string | null; video?: string | null; category?: string | null;
};

function Tile({ r }: { r: Row }) {
  const img = r.media_kind === "image" ? (r.media_url ?? null) : thumbOf(r.video);
  // Si la miniatura no existe se oculta y queda la portada con la pregunta.
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // Un 404 ANTES de hidratar no llega a onError: se comprueba al montar. Ojo con
  // loading="lazy": una imagen aún no pedida no tiene currentSrc, así que no se
  // confunde con una rota (complete + naturalWidth 0 + currentSrc).
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0 && el.currentSrc) setBroken(true);
  }, [img]);
  return (
    <Link href={`/p/${r.slug}`} className="relative aspect-square overflow-hidden bg-[var(--ink3)]">
      {/* Debajo, siempre, la portada temática: se ve mientras carga o si no hay miniatura */}
      <div className="absolute inset-0"><PorraCover title={r.title} category={r.category} size="sm" /></div>
      {img && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={ref} src={img} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)}
          className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-1.5 pt-5">
          <p className="line-clamp-3 text-center text-[9px] font-bold leading-tight text-white">{r.title}</p>
        </div>
      )}
      {r.video && (
        <span aria-hidden className="absolute left-1.5 top-1.5 text-[11px] text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">▶</span>
      )}
      {r.status === "resolved" && (
        <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/55 text-[11px] text-[var(--win)] backdrop-blur">✓</span>
      )}
    </Link>
  );
}

function Grid({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) return <p className="px-5 py-8 text-center text-sm text-[var(--muted)]">{empty}</p>;
  return (
    <div className="-mx-5 grid grid-cols-3 gap-[2px] lg:grid-cols-4">
      {rows.map((r) => <Tile key={r.id} r={r} />)}
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
