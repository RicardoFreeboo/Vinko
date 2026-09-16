import Link from "next/link";
import { PorraCover } from "@/components/PorraCover";
import type { FeedPorra } from "@/lib/feed";
import { t } from "@/lib/i18n";

// Tarjeta de porra del feed (como el prototipo: vídeo vertical IA arriba,
// pregunta, opciones, cierre). Vídeo en loop silencioso; sin vídeo → portada
// por temática. Enlaza a /p/[slug]. Sin anuncios aquí.
function fmtCloses(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid",
  }).format(new Date(iso));
}

export function PorraCard({ p }: { p: FeedPorra }) {
  return (
    <Link href={`/p/${p.slug}`}
      className="block overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] transition-colors hover:border-[var(--win)]">
      <div className="relative aspect-[16/10] w-full bg-[var(--ink3)]">
        {p.video ? (
          <video src={p.video} autoPlay muted loop playsInline preload="metadata"
            className="h-full w-full object-cover" />
        ) : (
          <PorraCover title={p.title} category={p.category} />
        )}
        {p.official && (
          <span className="mono absolute left-3 top-3 rounded-full bg-[var(--win)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink)]">
            {t("p.badgeOfficial")}
          </span>
        )}
        {p.featured && (
          <span className="mono absolute right-3 top-3 rounded-full bg-[var(--gold)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink)]">
            {t("home.featured")}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2.5 p-4">
        <h3 className="text-[17px] font-black leading-tight text-[var(--cream)] [text-wrap:balance]">{p.title}</h3>
        <div className="flex flex-wrap gap-1.5">
          {p.options.slice(0, 4).map((o, i) => (
            <span key={o.id}
              className="rounded-full border px-2.5 py-0.5 text-[12px] font-bold"
              style={{ borderColor: i % 2 ? "var(--gold)" : "var(--win)", color: i % 2 ? "var(--gold)" : "var(--win)" }}>
              {o.label}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="mono text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]">
            {t("home.closes", { date: fmtCloses(p.closes_at) })}
          </span>
          <span className="text-[13px] font-black text-[var(--win)]">{t("home.play")}</span>
        </div>
      </div>
    </Link>
  );
}
