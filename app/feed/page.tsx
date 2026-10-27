import Link from "next/link";
import type { Metadata } from "next";
import { Search } from "lucide-react";
import { getMemberSession } from "@/lib/session";
import { fetchMe } from "@/lib/me";
import { supabaseServer } from "@/lib/supabase/server";
import { getFeed } from "@/lib/feed";
import { VerticalFeed } from "@/components/feed/VerticalFeed";
import { Historias } from "@/components/feed/Historias";
import { DailyPick } from "@/components/DailyPick";
import { TzSync } from "@/components/TzSync";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

// DESCUBRIR (VINKO_PANTALLAS 05) — feed VERTICAL a pantalla completa (una
// predicción por pantalla, vídeo de fondo, pick inline). Arriba, las pestañas
// «tu país | Global» (si tu país es un mercado activo; 0077 marca cada
// predicción con el de quien la crea) y Buscar. El pique del día va en el
// primer slide.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("nav.descubrir") };

function madridDay(offset = 0): string {
  return new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
}

function Underline() {
  return <span aria-hidden className="absolute inset-x-0 -bottom-0.5 mx-auto h-[3px] w-6 rounded-full bg-[var(--win)]" />;
}

export default async function Feed({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const [{ m }, session] = await Promise.all([searchParams, getMemberSession()]);
  const sb = await supabaseServer();
  const me = session && sb ? await fetchMe(sb) : null;

  // Tu mercado: el del perfil o, si no, tu país cuando es un mercado activo.
  const code = (typeof me?.market === "string" ? me.market : null) ?? me?.country ?? null;
  const { data: mk } = code && code !== "GLOBAL" && sb
    ? await sb.from("markets").select("code, name").eq("code", code).eq("active", true).maybeSingle()
    : { data: null };
  const market = (mk as { code: string; name: string } | null) ?? null;
  const tab = market && m !== "global" ? market.code : null;
  const feed = await getFeed(30, tab);
  const tz = me?.tz ?? "America/Bogota";
  const today = madridDay(), yesterday = madridDay(-1);

  let daily: { id: string; question: string; options: string[]; status: string; correct_idx: number | null } | null = null;
  let myAnswer: number | null = null;
  let prev: { question: string; options: string[]; correct_idx: number | null;
    answer: { option_idx: number; correct: boolean | null; pts: number; score: number } | null } | null = null;
  const feedPicks: Record<string, string> = {};

  if (session && sb) {
    const [{ data: d }, { data: pv }] = await Promise.all([
      sb.from("daily_picks").select("*").eq("scheduled_for", today).eq("lang", "es").in("status", ["open", "resolved"]).maybeSingle(),
      sb.from("daily_picks").select("*").eq("scheduled_for", yesterday).eq("lang", "es").eq("status", "resolved").maybeSingle(),
    ]);
    if (d) {
      daily = { id: d.id, question: d.question, options: d.options as string[], status: d.status, correct_idx: d.correct_idx };
      const { data: a } = await sb.from("daily_pick_answers").select("option_idx").eq("day_id", d.id).eq("user_id", session.id).maybeSingle();
      myAnswer = a?.option_idx ?? null;
    }
    if (pv) {
      const { data: a } = await sb.from("daily_pick_answers").select("option_idx, correct, pts, score").eq("day_id", pv.id).eq("user_id", session.id).maybeSingle();
      prev = { question: pv.question, options: pv.options as string[], correct_idx: pv.correct_idx, answer: a ?? null };
    }
    if (feed.length) {
      const { data } = await sb.from("picks").select("porra_id, option_id").eq("user_id", session.id).in("porra_id", feed.map((f) => f.id));
      for (const pk of data ?? []) feedPicks[pk.porra_id] = pk.option_id;
    }
  }

  // FX-13: antes de las 9:00 (Madrid) el pique de hoy aún no está publicado →
  // "se abre a las 9:00" en vez de "hoy no hay".
  const madridHour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid", hour: "2-digit", hour12: false,
  }).format(new Date()));
  const dailyOpensSoon = !daily && madridHour < 9;
  const tabCls = (on: boolean) => `relative pb-2 text-[17px] font-black ${on ? "text-[var(--cream)]" : "text-white/55"}`;

  return (
    <main className="amb min-h-dvh w-full">
      {/* FX-03: guarda la zona horaria del dispositivo en el perfil (silencioso) */}
      {session && <TzSync />}
      {/* cabecera FIJA sobre el feed: pestañas centradas + Buscar (el degradado
          superior de cada slide la hace legible) */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 mx-auto flex h-16 w-full max-w-[430px] items-center justify-center px-4 pt-2">
        {!session && (
          <Link href="/feed" className="pointer-events-auto absolute left-4" aria-label={t("brand")}><Logo mark={26} word={18} /></Link>
        )}
        <nav aria-label={t("nav.descubrir")} className="pointer-events-auto flex items-center gap-7 [text-shadow:0_1px_8px_rgba(0,0,0,0.7)]">
          {market && (
            <Link href="/feed" aria-current={tab ? "page" : undefined} className={tabCls(!!tab)}>
              {market.name}{tab && <Underline />}
            </Link>
          )}
          <Link href={market ? "/feed?m=global" : "/feed"} aria-current={!tab ? "page" : undefined} className={tabCls(!tab)}>
            {t("descubrir.global")}{!tab && <Underline />}
          </Link>
        </nav>
        {session ? (
          <Link href="/buscar" aria-label={t("descubrir.search")}
            className="pointer-events-auto absolute right-4 grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white backdrop-blur">
            <Search size={20} strokeWidth={2.2} />
          </Link>
        ) : (
          <Link href="/login?next=/feed" className="pointer-events-auto absolute right-4 rounded-full bg-[var(--win)] px-3.5 py-1.5 text-[12px] font-black text-[var(--ink)]">
            {t("home.loginCta")}
          </Link>
        )}
      </header>

      <VerticalFeed porras={feed} initialPicks={feedPicks} loggedIn={!!session} now={Date.now()} tz={tz}
        empty={tab && market ? (
          <div className="rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] p-5 text-center">
            <p className="text-[15px] font-bold text-[var(--cream)]">{t("descubrir.emptyMarket", { market: market.name })}</p>
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/nueva" className="rounded-full bg-[var(--win)] px-4 py-2.5 text-[14px] font-black text-[var(--ink)]">{t("descubrir.emptyMarketCta")}</Link>
              <Link href="/feed?m=global" className="rounded-full border border-[var(--line2)] px-4 py-2.5 text-[14px] font-bold text-[var(--cream)]">{t("descubrir.seeGlobal")}</Link>
            </div>
          </div>
        ) : undefined}
        intro={
          <>
            {session ? (
              <DailyPick daily={daily} myAnswer={myAnswer} prev={prev} opensSoon={dailyOpensSoon} />
            ) : (
              <div className="rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] p-5 text-center">
                <p className="text-[20px] font-black leading-tight text-[var(--cream)] [text-wrap:balance]">{t("feed.introTitle")}</p>
                <p className="mt-2 text-sm text-[var(--muted)]">{t("home.loginCard")}</p>
                <Link href="/login?next=/feed" className="mt-4 inline-block rounded-full bg-[var(--win)] px-5 py-2.5 text-[14px] font-black text-[var(--ink)]">
                  {t("home.loginCta")}
                </Link>
              </div>
            )}
            {/* HISTORIAS (carril horizontal + visor a pantalla completa): recuperadas
                el 24-sep. Solo predicciones con vídeo; abre el StoriesViewer con swipe. */}
            <Historias porras={feed} initialPicks={feedPicks} loggedIn={!!session} />
          </>
        } />
      <AppNav />
    </main>
  );
}
