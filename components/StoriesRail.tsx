import Link from "next/link";
import type { FeedPorra } from "@/lib/feed";
import { t } from "@/lib/i18n";

// Historias: carrusel HORIZONTAL (se desliza a la derecha) de porras con vídeo,
// formato vertical 9:16 como el prototipo apk4. Cada tarjeta abre /p/[slug].
export function StoriesRail({ porras }: { porras: FeedPorra[] }) {
  const withVideo = porras.filter((p) => p.video).slice(0, 12);
  if (withVideo.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-black text-[var(--cream)]">{t("home.stories")}</h2>
      <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {withVideo.map((p) => (
          <Link key={p.id} href={`/p/${p.slug}`}
            className="relative aspect-[9/16] w-[132px] shrink-0 snap-start overflow-hidden rounded-[16px] border border-[var(--line)]">
            <video src={p.video!} autoPlay muted loop playsInline preload="metadata"
              className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/30" />
            {p.official && (
              <span className="mono absolute left-2 top-2 rounded-full bg-[var(--win)] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[var(--ink)]">
                {t("p.badgeOfficial")}
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 p-2.5">
              <p className="line-clamp-3 text-[12px] font-black leading-tight text-white">{p.title}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
