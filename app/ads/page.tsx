import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { t } from "@/lib/i18n";

// A1 · Landing pública de ANUNCIANTES (VINKO_PANTALLAS §6). Mismo sistema visual
// que la app, con la etiqueta dorada ADS junto al logo. SIN moneda ni degradado
// verde→oro (es página de destino de anuncios: revisión de Meta/Google).
// Pago por VOTO (B2B); el jugador nunca toca dinero.
export const metadata: Metadata = {
  title: "Vinko Ads",
  description: "Pon tu marca en la conversación. Pagas por voto, no por impresión.",
  robots: { index: true, follow: true },
};

function AdsLogo() {
  return (
    <span className="flex items-center gap-2">
      <Logo mark={30} word={22} />
      <span className="mono rounded-md bg-[var(--gold)] px-1.5 py-0.5 text-[11px] font-black uppercase tracking-[0.1em] text-[var(--ink)]">
        {t("ads.label")}
      </span>
    </span>
  );
}

export default function AdsLanding() {
  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[720px] flex-col gap-10 px-5 pb-16 pt-6">
      <header className="flex items-center justify-between">
        <AdsLogo />
        <Link href="/login?next=/ads/panel" className="mono rounded-full border border-[var(--line)] px-4 py-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
          {t("ads.landing.enter")}
        </Link>
      </header>

      {/* héroe */}
      <section className="flex flex-col items-start gap-5">
        <span className="mono inline-flex items-center gap-2 rounded-full border border-[var(--gold)]/40 bg-[rgba(255,194,61,0.08)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gold)]">
          {t("ads.landing.founder")}
        </span>
        <h1 className="text-[2.4rem] font-black leading-[1.03] tracking-[-0.035em] text-[var(--cream)] [text-wrap:balance] sm:text-[3rem]">
          {t("ads.landing.h1")}
        </h1>
        <p className="max-w-[560px] text-[17px] leading-relaxed text-[var(--muted)]">{t("ads.landing.sub")}</p>
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <Link
            href="/login?next=/ads/nueva"
            className="flex h-[58px] items-center justify-center rounded-full bg-[var(--win)] px-8 text-[17px] font-black text-[var(--ink)]"
            style={{ boxShadow: "0 5px 0 var(--windeep)" }}
          >
            {t("ads.landing.cta")}
          </Link>
          <p className="mono text-center text-[12px] text-[var(--muted2)] sm:text-left">{t("ads.landing.ctaSub")}</p>
        </div>
      </section>

      {/* tarjeta de ejemplo (cifras coherentes: 1.500 votos a 0,08 USD ≈ 120 USD) */}
      <section className="rounded-[20px] border border-[var(--line)] bg-[var(--ink2)] p-5">
        <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("ads.landing.exampleTag")}</p>
        <p className="mt-2 text-[17px] font-black leading-tight text-[var(--cream)]">
          {t("ads.landing.exampleQ")}
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          {([["1.500", "ads.m.votes"], ["0,08 USD", "ads.m.cpv"], ["38", "ads.m.shares"]] as const).map(([v, k]) => (
            <div key={k} className="rounded-[14px] bg-[var(--ink3)] p-3">
              <div className="mono text-[20px] font-black text-[var(--win)]">{v}</div>
              <div className="mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">{t(k)}</div>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-[12px] font-bold text-[var(--cream)]">
            <span>{t("ads.landing.opinionA")}</span><span>{t("ads.landing.opinionB")}</span>
          </div>
          <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-[var(--ink3)]">
            <span className="h-full bg-[var(--win)]" style={{ width: "62%" }} />
            <span className="h-full bg-[var(--gold)]" style={{ width: "38%" }} />
          </div>
        </div>
      </section>

      {/* tres ventajas */}
      <section className="grid gap-4 sm:grid-cols-3">
        {(["brand", "real", "data"] as const).map((k) => (
          <div key={k} className="rounded-[18px] border border-[var(--line)] bg-[var(--ink2)] p-4">
            <h3 className="text-[15px] font-black text-[var(--cream)]">{t(`ads.landing.adv.${k}.title`)}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">{t(`ads.landing.adv.${k}.body`)}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-[var(--line)] pt-5">
        <p className="text-[12px] leading-relaxed text-[var(--muted)]">{t("ads.landing.legal")}</p>
      </footer>
    </main>
  );
}
