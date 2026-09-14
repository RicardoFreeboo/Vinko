import type { Metadata } from "next";
import Link from "next/link";
import { getPorraBySlug } from "@/lib/porras";
import { t } from "@/lib/i18n";

// Métrica sagrada: SSR <2s en Android medio 4G. Título y opciones son HTML
// usable sin JS (server component puro, cero código de cliente).
export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

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
      <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-semibold">{t("p.notAvailable")}</p>
        <Link href="/" className="text-sm text-[var(--acc2)] underline">
          {t("p.backHome")}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 py-8">
      <header className="flex items-center justify-between">
        <span className="bg-gradient-to-r from-[var(--acc)] to-[var(--acc2)] bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
          {t("brand")}
        </span>
        {porra.is_template && (
          <span className="rounded-full border border-[var(--acc2)] px-3 py-1 text-xs font-bold text-[var(--acc2)]">
            {t("p.badgeExample")}
          </span>
        )}
      </header>

      <h1 className="text-2xl font-extrabold leading-snug [text-wrap:balance]">
        {porra.title}
      </h1>

      <p className="text-sm text-[var(--tx2)]">
        {porra.status === "resolved"
          ? t("p.resolved")
          : t("p.closes", { date: fmtDate(porra.closes_at) })}
      </p>

      <section aria-label={t("p.options")} className="flex flex-col gap-2.5">
        {porra.options.map((o) => (
          <div
            key={o.id}
            className={`rounded-xl border px-4 py-3.5 text-[15px] font-semibold ${
              porra.winning_option_id === o.id
                ? "border-[var(--acc2)] text-[var(--acc2)]"
                : "border-[var(--line)] bg-[var(--card)]"
            }`}
          >
            {o.label}
          </div>
        ))}
      </section>

      <Link
        href="/login"
        className="rounded-xl bg-gradient-to-r from-[var(--acc)] to-[#5e35b1] px-4 py-3.5 text-center text-[15px] font-extrabold"
      >
        {t("p.join")}
      </Link>

      <footer className="mt-auto flex flex-col gap-1 pt-6 text-xs text-[var(--tx2)]">
        <p>{t("p.judge")}</p>
        <p>{t("p.pointsNote")}</p>
      </footer>
    </main>
  );
}
