import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

// PORTADA PÚBLICA. Google exige poder ver de qué va la app SIN iniciar sesión
// (si no, no verifica el dominio y no deja publicar el consentimiento OAuth).
// Por eso esta página queda fuera del candado del alfa y no redirige a /feed.
export const metadata: Metadata = {
  title: t("landing.title"),
  description: t("landing.sub"),
  robots: { index: true, follow: true },
};

const PASOS = ["create", "share", "pick", "resolve"] as const;

export default function Landing() {
  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-8 px-6 pb-12 pt-10">
      <header className="flex items-center justify-between">
        <Logo mark={32} word={22} />
        <Link href="/login"
          className="rounded-full bg-[var(--win)] px-4 py-2 text-[13px] font-black text-[var(--ink)]">
          {t("landing.cta")}
        </Link>
      </header>

      <section className="flex flex-col gap-3">
        <h1 className="text-[2rem] font-black leading-[1.1] tracking-tight text-[var(--cream)] [text-wrap:balance]">
          {t("landing.h1")}
        </h1>
        <p className="text-[15px] leading-relaxed text-[var(--muted)]">{t("landing.sub")}</p>
      </section>

      <section className="flex flex-col gap-2">
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("landing.howTag")}</p>
        <ol className="flex flex-col gap-2">
          {PASOS.map((k, i) => (
            <li key={k} className="flex items-start gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3">
              <span className="mono grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[var(--win)] text-[11px] font-black text-[var(--win)]">
                {i + 1}
              </span>
              <span className="text-[14px] leading-snug text-[var(--cream)]">{t(`landing.step.${k}`)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-[14px] border border-[var(--gold)]/40 bg-[var(--gold)]/5 px-4 py-3.5">
        <p className="text-[13px] leading-relaxed text-[var(--cream)]">{t("landing.points")}</p>
      </section>

      <Link href="/login"
        className="flex items-center justify-center rounded-[14px] bg-[var(--win)] px-4 py-4 text-[16px] font-black text-[var(--ink)]">
        {t("landing.cta")}
      </Link>

      <footer className="mt-auto flex flex-col gap-2 border-t border-[var(--line)] pt-5">
        <p className="text-[12px] leading-relaxed text-[var(--muted)]">{t("landing.age")}</p>
        <nav className="flex gap-4 text-[12px] font-bold">
          <Link href="/privacidad" className="text-[var(--win)]">{t("legal.privacy.title")}</Link>
          <Link href="/terminos" className="text-[var(--win)]">{t("legal.terms.title")}</Link>
        </nav>
        <p className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted2)]">{t("og.footer")}</p>
      </footer>
    </main>
  );
}
