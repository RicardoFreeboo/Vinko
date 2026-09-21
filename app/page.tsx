import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { TEMPLATES } from "@/lib/templates";
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

// Escritorio: móvil dibujado con 3 porras de EJEMPLO (las plantillas
// is_template de lib/templates, sin picks ni gente inventada). Decorativo.
const DEMO = TEMPLATES.slice(0, 3);

export default function Landing() {
  return (
    // lg+: dos columnas (texto a la izquierda, móvil a la derecha). Móvil:
    // intacto — el <div> de texto repite el flex-col gap-8 y el mock va oculto.
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[560px] flex-col gap-8 px-6 pb-12 pt-10 lg:grid lg:max-w-[1040px] lg:grid-cols-[1fr_380px] lg:grid-rows-[auto_1fr_auto] lg:gap-x-16 lg:gap-y-10 lg:px-8">
      <header className="flex items-center justify-between lg:col-span-2">
        <Logo mark={32} word={22} />
        <Link href="/login"
          className="rounded-full bg-[var(--win)] px-4 py-2 text-[13px] font-black text-[var(--ink)]">
          {t("landing.cta")}
        </Link>
      </header>

      <div className="flex flex-col gap-8 lg:justify-center">
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
      </div>

      {/* MÓVIL DIBUJADO (solo escritorio): un vistazo al feed con 3 ejemplos */}
      <div aria-hidden className="hidden lg:block lg:self-center">
        <div className="mx-auto w-[300px] rounded-[40px] border-[6px] border-[var(--ink3)] bg-[var(--ink)] p-3 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
          <div className="mx-auto mb-3 h-5 w-24 rounded-full bg-[var(--ink3)]" />
          <div className="flex items-center justify-between px-1">
            <Logo mark={20} word={14} />
            <span className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("nav.feed")}</span>
          </div>
          <div className="mt-3 flex flex-col gap-2.5">
            {DEMO.map((p) => (
              <div key={p.slug} className="rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] p-3">
                <span className="mono text-[9px] uppercase tracking-[0.14em] text-[var(--win)]">{t("p.badgeExample")}</span>
                <p className="mt-1 text-[13px] font-black leading-tight text-[var(--cream)]">{p.title}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.options.map((o) => (
                    <span key={o.id} className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] font-bold text-[var(--cream)]">{o.label}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-around border-t border-[var(--line)] pt-2 text-[8px] font-bold uppercase tracking-wide text-[var(--muted)]">
            <span className="text-[var(--win)]">{t("nav.feed")}</span>
            <span>{t("nav.perfil")}</span>
            <span>{t("nav.crear")}</span>
            <span>{t("nav.grupos")}</span>
            <span>{t("nav.liga")}</span>
          </div>
        </div>
      </div>

      <footer className="mt-auto flex flex-col gap-2 border-t border-[var(--line)] pt-5 lg:col-span-2">
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
