import Link from "next/link";
import type { Metadata } from "next";
import { Clock } from "lucide-react";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

// PORTADA PÚBLICA (VINKO_PANTALLAS · pantalla 16). Portada limpia, solo-puntos y
// enfocada a Colombia: héroe + ejemplo + aviso de edad. Pública y sin candado
// (Google necesita ver de qué va la app sin login para el consentimiento OAuth).
//
// Reemplaza la portada 3D de la era con dinero (héroe con moneda, StakeRotator,
// TiltCard…), que queda en el historial de git. Aquí: sin moneda ni degradado
// verde→oro, palabra «predicción» (universal LatAm) y SIN marcas de operadores de
// juego (nada de ligas patrocinadas por casas de apuestas). Léxico: solo puntos.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: t("landing.co.metaTitle"),
    description: t("landing.co.metaDesc"),
    robots: { index: true, follow: true },
  };
}

const CREATE_HREF = "/login?next=/nueva";

export default function Landing() {
  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-5 pb-10 pt-5">
      <header className="flex items-center justify-between">
        <Logo mark={30} word={22} />
        <Link
          href="/login"
          className="rounded-full border border-[var(--line)] px-4 py-2 text-[13px] font-bold text-[var(--cream)]"
        >
          {t("landing.co.enter")}
        </Link>
      </header>

      {/* ---------- héroe ---------- */}
      <section className="relative mt-9">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-10 -top-20 h-[340px]"
          style={{ background: "radial-gradient(60% 60% at 70% 30%, rgba(31,224,122,.14), transparent 70%)" }}
        />
        <div className="relative flex flex-col items-start">
          <span className="eyebrow text-[var(--win)]">{t("landing.co.eyebrow")}</span>
          <h1 className="mt-3.5 text-[2.6rem] font-black leading-[0.98] tracking-[-0.035em] text-[var(--cream)] sm:text-[3rem]">
            {t("landing.co.h1a")}<br />{t("landing.co.h1b")}
          </h1>
          <p className="mt-4 text-[17px] leading-relaxed text-[var(--muted)]">{t("landing.co.sub")}</p>

          <Link
            href={CREATE_HREF}
            className="mt-6 flex h-[58px] w-full items-center justify-center rounded-full bg-[var(--win)] text-[17px] font-black text-[var(--ink)]"
            style={{ boxShadow: "0 5px 0 var(--windeep)" }}
          >
            {t("landing.co.create")}
          </Link>
          <Link
            href="/feed"
            className="mt-2.5 flex h-[52px] w-full items-center justify-center rounded-full border border-[var(--line)] text-[16px] font-bold text-[var(--cream)]"
          >
            {t("landing.co.see")}
          </Link>
        </div>
      </section>

      {/* ---------- ejemplo ---------- */}
      <section className="mt-8">
        <div
          className="rounded-[20px] border border-[var(--line)] bg-[var(--ink2)] p-5"
          style={{ transform: "rotate(-1.5deg)" }}
        >
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--cream)]">
            <span>⚽ {t("landing.co.exTag")}</span>
            <span className="flex-1" />
            <span className="flex items-center gap-1 text-[var(--muted)]">
              <Clock size={14} /> {t("landing.co.exWhen")}
            </span>
          </div>
          <div className="mt-2 text-[20px] font-black leading-tight text-[var(--cream)]">{t("landing.co.exQ")}</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="flex items-center justify-center rounded-[12px] border-[1.5px] border-[var(--win)] bg-[rgba(31,224,122,.1)] py-2.5 text-[14px] font-bold text-[var(--win)]">
              {t("landing.co.exA")}
            </div>
            <div className="flex items-center justify-center rounded-[12px] border-[1.5px] border-[var(--gold)] bg-[rgba(255,194,61,.08)] py-2.5 text-[14px] font-bold text-[var(--gold)]">
              {t("landing.co.exB")}
            </div>
          </div>
        </div>
      </section>

      <p className="mt-auto pt-8 text-center text-[13px] text-[var(--muted2)]">{t("landing.co.foot")}</p>
      <footer className="mt-4 flex justify-center gap-5 text-[12px] font-bold">
        <Link href="/privacidad" className="text-[var(--win)]">{t("legal.privacy.title")}</Link>
        <Link href="/terminos" className="text-[var(--win)]">{t("legal.terms.title")}</Link>
      </footer>
    </main>
  );
}
