import type { Metadata } from "next";
import Link from "next/link";
import { getPorraBySlug } from "@/lib/porras";
import { Logo, VMark } from "@/components/Logo";
import { t } from "@/lib/i18n";

// Métrica sagrada: SSR <2s en Android medio 4G. Título y opciones son HTML
// usable sin JS (server component puro, cero código de cliente, cero fuentes
// externas). Estética real de Vinko: verde-negro, verde/oro, mono en datos.
export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

// Plantillas = cero picks (regla de datos): NO se pintan porcentajes falsos.
const OPT_ACCENT = ["var(--win)", "var(--gold)", "var(--win)", "var(--gold)", "var(--win)", "var(--gold)"];
const OPT_LETTER = ["A", "B", "C", "D", "E", "F"];

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  }).format(new Date(iso));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const porra = await getPorraBySlug(slug);
  if (!porra || porra.status === "taken_down") {
    return { title: t("p.notAvailable") };
  }
  return {
    title: porra.title,
    description: t("og.description"),
    openGraph: {
      title: porra.title,
      description: t("og.description"),
      siteName: t("brand"),
      type: "website",
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function PorraPage({ params }: Props) {
  const { slug } = await params;
  const porra = await getPorraBySlug(slug);

  if (!porra || porra.status === "taken_down") {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-4 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-lg font-bold">{t("p.notAvailable")}</p>
        <Link href="/" className="mono text-xs uppercase tracking-widest text-[var(--win)]">
          {t("p.backHome")}
        </Link>
      </main>
    );
  }

  const resolved = porra.status === "resolved";

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pb-8 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={28} word={20} />
        {porra.is_template ? (
          <span className="mono rounded-full border border-[var(--win)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--win)]">
            {t("p.badgeExample")}
          </span>
        ) : porra.official ? (
          <span className="mono rounded-full bg-[var(--win)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink)]">
            {t("p.badgeOfficial")}
          </span>
        ) : null}
      </header>

      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--ink2)]">
        {porra.video ? (
          <video
            src={porra.video}
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            <VMark size={38} />
            <span className="mono text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]">
              {t("p.aiMaking")}
            </span>
          </div>
        )}
      </div>

      <p className="mono text-xs uppercase tracking-[0.1em] text-[var(--muted)]">
        {resolved ? t("p.resolved") : t("p.closes", { date: fmtDate(porra.closes_at) })}
      </p>

      <h1 className="text-[1.7rem] font-black leading-[1.12] tracking-tight text-[var(--cream)] [text-wrap:balance]">
        {porra.title}
      </h1>

      <section aria-label={t("p.options")} className="flex flex-col gap-2.5">
        {porra.options.map((o, i) => {
          const accent = OPT_ACCENT[i % OPT_ACCENT.length];
          const win = porra.winning_option_id === o.id;
          return (
            <div
              key={o.id}
              className="flex items-center gap-3 overflow-hidden rounded-[14px] border bg-[var(--ink2)] px-3.5 py-3.5"
              style={{ borderColor: win ? accent : "var(--line)" }}
            >
              <span
                className="mono flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black"
                style={{ color: accent, border: `2px solid ${accent}` }}
              >
                {OPT_LETTER[i]}
              </span>
              <span className="flex-1 text-[15px] font-bold text-[var(--cream)]">
                {o.label}
              </span>
              {win && (
                <span className="mono text-xs font-black uppercase" style={{ color: accent }}>
                  ✓
                </span>
              )}
            </div>
          );
        })}
      </section>

      <Link
        href="/login"
        className="rounded-[14px] bg-[var(--win)] px-4 py-4 text-center text-[15px] font-black text-[var(--ink)]"
      >
        ⚡ {t("p.join")}
      </Link>

      <footer className="mt-auto flex flex-col gap-1.5 pt-6">
        <p className="mono text-[11px] uppercase tracking-[0.1em] text-[var(--muted2)]">
          {t("og.footer")}
        </p>
        <p className="text-xs text-[var(--muted)]">{t("p.judge")}</p>
        <p className="text-xs text-[var(--muted)]">{t("p.pointsNote")}</p>
      </footer>
    </main>
  );
}
