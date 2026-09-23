import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { TEMPLATES } from "@/lib/templates";
import { HeroStage } from "@/components/landing/HeroStage";
import { StakeRotator } from "@/components/landing/StakeRotator";
import { TiltCard } from "@/components/landing/TiltCard";
import { Coin3D } from "@/components/landing/Coin3D";
import { RevealObserver } from "@/components/landing/RevealObserver";
import { t } from "@/lib/i18n";
import "./landing.css";

// PORTADA PÚBLICA. Google exige poder ver de qué va la app SIN iniciar sesión
// (si no, no verifica el dominio y no deja publicar el consentimiento OAuth).
// Por eso esta página queda fuera del candado del alfa y no redirige a /feed.
//
// Mensaje: con dinero o sin dinero, cada grupo se juega lo que quiera (Vinkos,
// una ronda, dinero entre amigos). Vinko no toca el dinero: el P2P va directo
// entre la gente (ver p2p.* y la migración 0054). El dinero es solo +18.
//
// Diseño: 3D con CSS (app/landing.css), sin three.js, para no penalizar la
// carga en móvil. Las islas de cliente son pequeñas: el escenario del móvil,
// el rotador de palabras, la inclinación de tarjetas y el reveal al scroll.
export const metadata: Metadata = {
  title: t("landing.title"),
  description: t("landing.sub"),
  robots: { index: true, follow: true },
};

const CREATE_HREF = "/login?next=/nueva";
const STAKES = [0, 1, 2, 3, 4, 5].map((i) => t(`landing.stake.${i}`));
const TICKER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => t(`landing.ticker.${i}`));
const STEPS = ["create", "share", "pick", "resolve"] as const;
const STEP_ICON = ["✍️", "💬", "👆", "🏆"];
const IDEAS = TEMPLATES.slice(0, 6);

const MODES = [
  { k: "vinkos", icon: "🪙", tint: "rgba(255,194,61,0.16)", accent: "var(--gold)" },
  { k: "free", icon: "🍺", tint: "rgba(31,224,122,0.16)", accent: "var(--win)" },
  { k: "money", icon: "💶", tint: "rgba(138,245,189,0.14)", accent: "#8af5bd" },
] as const;

function Ticker({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  // Lista duplicada para el bucle infinito; la copia va aria-hidden.
  return (
    <div className={`lx-ticker ${reverse ? "rev" : ""}`}>
      {items.map((x) => <span key={x} className="lx-chip">{x}</span>)}
      <span aria-hidden className="contents">
        {items.map((x) => <span key={`d-${x}`} className="lx-chip">{x}</span>)}
      </span>
    </div>
  );
}

export default function Landing() {
  return (
    <main className="lx min-h-dvh text-[var(--cream)]">
      <RevealObserver />

      {/* fondo: auroras verde/oro + suelo de rejilla en perspectiva */}
      <div aria-hidden className="lx-bg">
        <span className="lx-aurora a1" />
        <span className="lx-aurora a2" />
        <span className="lx-aurora a3" />
        <div className="lx-floor" />
        <div className="lx-noise" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-[1180px] items-center justify-between px-5 pt-5 sm:px-8">
        <Logo mark={34} word={24} />
        <Link href="/login" className="lx-btn lx-btn-ghost rounded-full px-5 py-2.5 text-[14px]">
          {t("landing.cta")}
        </Link>
      </header>

      {/* ============ HÉROE ============ */}
      <section className="relative mx-auto grid w-full max-w-[1180px] items-center gap-2 px-5 pb-6 pt-8 sm:px-8 lg:grid-cols-[1.08fr_1fr] lg:gap-6 lg:pb-16 lg:pt-12">
        <div className="flex flex-col items-center gap-6 text-center lg:items-start lg:text-left">
          <span data-reveal className="lx-pill mono whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--win)] sm:text-[10.5px] sm:tracking-[0.14em]">
            <span className="lx-dot" />
            {t("landing.eyebrow")}
          </span>

          <h1
            data-reveal
            style={{ ["--d" as string]: "80ms" }}
            className="max-w-[640px] text-[2.25rem] font-black leading-[1.03] tracking-[-0.035em] [text-wrap:balance] sm:text-[3.3rem] lg:text-[4rem]"
          >
            {t("landing.h1")}
          </h1>

          <div data-reveal style={{ ["--d" as string]: "160ms" }} className="flex w-full flex-col gap-1">
            <span className="mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">{t("landing.stakeLabel")}</span>
            <StakeRotator items={STAKES} className="text-[1.9rem] font-black leading-[1.2] tracking-tight sm:text-[2.5rem]" itemClassName="lx-grad" />
          </div>

          <p data-reveal style={{ ["--d" as string]: "240ms" }} className="max-w-[560px] text-[16px] leading-relaxed text-[var(--muted)] sm:text-[17px]">
            {t("landing.sub")}
          </p>

          <div data-reveal style={{ ["--d" as string]: "320ms" }} className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link href={CREATE_HREF} className="lx-btn lx-btn-primary px-7 py-4 text-[17px]">
              ✨ {t("landing.ctaCreate")}
            </Link>
            <a href="#como" className="lx-btn lx-btn-ghost px-6 py-4 text-[15px]">
              {t("landing.ctaHow")} ↓
            </a>
          </div>

          <ul data-reveal style={{ ["--d" as string]: "400ms" }} className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[12px] font-bold sm:gap-x-5 sm:text-[13px] text-[var(--muted)] lg:justify-start">
            <li>⚡ {t("landing.trust.fast")}</li>
            <li>💬 {t("landing.trust.whatsapp")}</li>
            <li>🔒 {t("landing.trust.money")}</li>
          </ul>
        </div>

        <HeroStage />
      </section>

      {/* ============ CINTA: LO QUE OS JUGÁIS ============ */}
      <section aria-label={t("landing.stakeLabel")} className="lx-ticker-wrap py-6">
        <div className="lx-ticker-tilt flex flex-col gap-3">
          <Ticker items={TICKER} />
          <Ticker items={[...TICKER].reverse()} reverse />
        </div>
      </section>

      {/* ============ TRES MODOS ============ */}
      <section id="modos" className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 lg:py-24">
        <div data-reveal className="mx-auto flex max-w-[720px] flex-col items-center gap-3 text-center">
          <span className="eyebrow text-[11px]">{t("landing.modes.tag")}</span>
          <h2 className="text-[2rem] font-black leading-[1.05] tracking-[-0.03em] [text-wrap:balance] sm:text-[2.8rem]">
            {t("landing.modes.title")}
          </h2>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {MODES.map((m, i) => (
            <div key={m.k} data-reveal style={{ ["--d" as string]: `${i * 110}ms` }}>
              <TiltCard className="lx-mode h-full p-6" max={9} style={{ ["--tint" as string]: m.tint }}>
                <div className="lx-pop-z lx-mode-icon">{m.icon}</div>
                <h3 className="lx-pop-z2 mt-5 text-[1.35rem] font-black tracking-tight" style={{ color: m.accent }}>
                  {t(`landing.modes.${m.k}.title`)}
                </h3>
                <p className="lx-pop-z2 mt-2 text-[15px] leading-relaxed text-[var(--cream)]/85">
                  {t(`landing.modes.${m.k}.body`)}
                </p>
                <span className="mono lx-pop-z2 mt-5 inline-block rounded-full border border-[var(--line)] px-3 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                  {t(`landing.modes.${m.k}.tag`)}
                </span>
              </TiltCard>
            </div>
          ))}
        </div>

        <p data-reveal className="mx-auto mt-8 max-w-[760px] text-center text-[13px] leading-relaxed text-[var(--muted)]">
          {t("landing.points")}
        </p>
      </section>

      {/* ============ CÓMO FUNCIONA ============ */}
      <section id="como" className="relative mx-auto w-full max-w-[1180px] scroll-mt-6 px-5 py-16 sm:px-8 lg:py-24">
        <div data-reveal className="mx-auto flex max-w-[720px] flex-col items-center gap-3 text-center">
          <span className="eyebrow text-[11px]">{t("landing.howTag")}</span>
          <h2 className="text-[2rem] font-black leading-[1.05] tracking-[-0.03em] [text-wrap:balance] sm:text-[2.8rem]">
            {t("landing.how.title")}
          </h2>
        </div>

        <ol className="relative mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* línea que une los pasos (escritorio) */}
          <span aria-hidden className="absolute left-[12%] right-[12%] top-[52px] hidden h-px bg-gradient-to-r from-transparent via-[var(--win)]/50 to-transparent lg:block" />
          {STEPS.map((k, i) => (
            <li key={k} data-reveal style={{ ["--d" as string]: `${i * 120}ms` }}>
              <TiltCard className="h-full rounded-[22px] border border-[var(--line)] bg-[var(--ink2)]/80 p-5 backdrop-blur" max={8}>
                <div className="lx-pop-z flex items-center justify-between">
                  <span className="lx-step-num">{String(i + 1).padStart(2, "0")}</span>
                  <span className="grid h-12 w-12 place-items-center rounded-2xl border border-[var(--line)] bg-[var(--ink)] text-[24px] shadow-[0_10px_24px_-10px_rgba(0,0,0,0.9)]">
                    {STEP_ICON[i]}
                  </span>
                </div>
                <p className="lx-pop-z2 mt-4 text-[15px] leading-snug text-[var(--cream)]">{t(`landing.step.${k}`)}</p>
              </TiltCard>
            </li>
          ))}
        </ol>
      </section>

      {/* ============ IDEAS (plantillas de ejemplo) ============ */}
      <section className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 lg:py-20">
        <div data-reveal className="flex flex-col items-center gap-3 text-center">
          <span className="eyebrow text-[11px]">{t("landing.ideas.tag")}</span>
          <h2 className="text-[1.8rem] font-black leading-[1.08] tracking-[-0.03em] [text-wrap:balance] sm:text-[2.4rem]">
            {t("landing.ideas.title")}
          </h2>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {IDEAS.map((p, i) => (
            <div key={p.slug} data-reveal style={{ ["--d" as string]: `${(i % 3) * 90}ms` }}>
              <Link href={`/p/${p.slug}`} className="block h-full">
                <TiltCard className="flex h-full flex-col gap-3 rounded-[20px] border border-[var(--line)] bg-[var(--ink2)] p-5 hover:border-[var(--win)]/50" max={7}>
                  <span className="mono lx-pop-z2 text-[9.5px] uppercase tracking-[0.14em] text-[var(--win)]">{t("p.badgeExample")}</span>
                  <p className="lx-pop-z text-[17px] font-black leading-tight text-[var(--cream)]">{p.title}</p>
                  <div className="lx-pop-z2 flex flex-wrap gap-1.5">
                    {p.options.map((o) => (
                      <span key={o.id} className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[12px] font-bold text-[var(--cream)]">{o.label}</span>
                    ))}
                  </div>
                  <span className="mono mt-auto pt-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">{t("landing.ideas.open")}</span>
                </TiltCard>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ============ CTA FINAL ============ */}
      <section className="mx-auto w-full max-w-[1180px] px-5 pb-16 pt-6 sm:px-8 lg:pb-24">
        <div data-reveal>
          <TiltCard className="relative overflow-hidden rounded-[32px] border border-[var(--win)]/30 p-8 text-center sm:p-12" max={4}
            style={{ background: "radial-gradient(90% 120% at 50% 0%, rgba(31,224,122,0.22), transparent 60%), radial-gradient(80% 100% at 100% 100%, rgba(255,194,61,0.16), transparent 60%), #111718" }}>
            <div className="lx-pop-z mx-auto mb-6 flex justify-center" style={{ perspective: "600px" }}>
              <Coin3D size={110} />
            </div>
            <h2 className="lx-pop-z2 mx-auto max-w-[760px] text-[2rem] font-black leading-[1.05] tracking-[-0.03em] [text-wrap:balance] sm:text-[3rem]">
              {t("landing.final.title")}
            </h2>
            <p className="lx-pop-z2 mx-auto mt-4 max-w-[520px] text-[16px] leading-relaxed text-[var(--muted)]">{t("landing.final.body")}</p>
            <div className="lx-pop-z mt-8 flex justify-center">
              <Link href={CREATE_HREF} className="lx-btn lx-btn-primary w-full px-8 py-4 text-[17px] sm:w-auto">
                ✨ {t("landing.ctaCreate")}
              </Link>
            </div>
          </TiltCard>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 border-t border-[var(--line)] px-5 pb-10 pt-6 sm:px-8">
        <p className="max-w-[900px] text-[12px] leading-relaxed text-[var(--muted)]">{t("landing.age")}</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[12px] font-bold">
          <Link href="/privacidad" className="text-[var(--win)]">{t("legal.privacy.title")}</Link>
          <Link href="/terminos" className="text-[var(--win)]">{t("legal.terms.title")}</Link>
          <Link href="/juego-seguro" className="text-[var(--win)]">{t("landing.safe")}</Link>
        </nav>
        <p className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted2)]">{t("og.footer")}</p>
      </footer>
    </main>
  );
}
