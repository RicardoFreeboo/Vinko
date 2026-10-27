import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { getMemberSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchMe } from "@/lib/me";
import { madridClock } from "@/lib/gate";
import { SITE } from "@/lib/share";
import { SaldoClient } from "@/components/SaldoClient";
import { VinkosStreak } from "@/components/VinkosStreak";
import { VinkoCoin } from "@/components/VinkoCoin";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

// TUS VINKOS (modo solo-puntos): saldo, regalo diario, goteo, anuncios
// recompensados, tu enlace de invitación y cómo se gana cada Vinko. Es el
// destino de «Saldo» (DesktopShell), de «Mis Vinkos →» y de la fila de Vinkos
// del perfil (VINKO_PANTALLAS 13). Antes redirigía a /perfil, que enlaza aquí:
// el botón daba vueltas sin llevar a ningún sitio, y el regalo diario y los
// anuncios recompensados se habían quedado sin pantalla.
//
// Los Vinkos son gratis y sin valor (REGLAS-LEGALES §1-2): aquí no se compra,
// no se canjea y no se transfiere nada. El crédito SIEMPRE lo hace el servidor
// (claim_daily_bonus, claim_drip, rewards-claim → grant_ad_reward_v2) y los
// anuncios dan Vinkos o escudo, JAMÁS Puntería.
//
// La lista "cómo se ganan" sale de remote_config (economy/ads) + de las cifras
// fijas de las RPC (0030): la pantalla dice EXACTAMENTE lo que paga el
// servidor. Si remote_config no se puede leer, constantes de abajo.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: t("saldo.title"),
  robots: { index: false, follow: false },
};

// Fijas en las RPC (0030): grant_share_reward = 50 (1/día); make_pick paga al
// creador +25 por participante real hasta 500/porra.
const SHARE_PTS = 50;
const CREATOR_PTS = 25;
const CREATOR_CAP = 500;
// Fallback si remote_config no responde (mismos valores que el seed de 0006).
const ECO_FALLBACK = {
  daily_bonus: [50, 75, 100, 150, 200, 300, 500],
  invite_pts: 200, invitee_pts: 200,
  ad_reward_pts: 200, ad_reward_daily_cap: 3,
  streak7_pts: 500,
};

type Eco = typeof ECO_FALLBACK;
function readEconomy(rows: { key: string; value: unknown }[] | null | undefined): Eco {
  const eco = (rows?.find((r) => r.key === "economy")?.value ?? {}) as Record<string, unknown>;
  const ads = (rows?.find((r) => r.key === "ads")?.value ?? {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const ladder = Array.isArray(eco.daily_bonus) && eco.daily_bonus.length > 0
    ? (eco.daily_bonus as unknown[]).map((v) => num(v, 0)) : ECO_FALLBACK.daily_bonus;
  // El anuncio de Vinkos lo paga grant_ad_reward_v2 con cfg('ads').slots.R2
  // (value/cap_day); economy.ad_reward_* es el respaldo.
  const r2 = ((ads.slots as Record<string, unknown> | undefined)?.R2 ?? {}) as Record<string, unknown>;
  const mile7 = ((eco.streak_milestones as Record<string, unknown> | undefined)?.["7"] ?? {}) as Record<string, unknown>;
  return {
    daily_bonus: ladder,
    invite_pts: num(eco.invite_pts, ECO_FALLBACK.invite_pts),
    invitee_pts: num(eco.invitee_pts, ECO_FALLBACK.invitee_pts),
    ad_reward_pts: num(r2.value, num(eco.ad_reward_pts, ECO_FALLBACK.ad_reward_pts)),
    ad_reward_daily_cap: num(r2.cap_day, num(eco.ad_reward_daily_cap, ECO_FALLBACK.ad_reward_daily_cap)),
    streak7_pts: num(mile7.pts, ECO_FALLBACK.streak7_pts),
  };
}

function yesterdayOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default async function Saldo() {
  const session = await getMemberSession();
  if (!session) return <Aviso text={t("saldo.login")} cta={t("saldo.loginCta")} href="/login?next=/saldo" />;
  if (!session.birth_year) return <Aviso text={t("saldo.age")} cta={t("saldo.ageCta")} href="/bienvenida?next=/saldo" />;

  const sb = await supabaseServer();
  if (!sb) notFound();
  // SEC-01: todo esto es del PROPIO perfil (racha, regalo, escudos…) → me().
  const [p, { data: cfgRows }] = await Promise.all([
    fetchMe(sb),
    sb.from("remote_config").select("key, value").in("key", ["economy", "ads"]),
  ]);
  const eco = readEconomy(cfgRows);

  const today = madridClock().day;
  const isAdult = new Date().getFullYear() - session.birth_year >= 18;
  const recoverable =
    !!p?.streak_recover_until && new Date(p.streak_recover_until) > new Date() &&
    (p?.streak_broken_days ?? 0) > 0;

  // Regalo diario: mismo cálculo que claim_daily_bonus (ayer → siguiente
  // peldaño; si no, vuelve al 1).
  const bonusLast = p?.daily_bonus_last ?? null;
  const bonusStep = bonusLast === yesterdayOf(today)
    ? Math.min((p?.daily_bonus_step ?? 0) + 1, eco.daily_bonus.length) : 1;
  const bonusPts = eco.daily_bonus[bonusStep - 1] ?? eco.daily_bonus[0];

  const points = p?.points ?? session.points ?? 0;
  const refUrl = session.handle ? `${SITE}/?ref=${encodeURIComponent(session.handle)}` : `${SITE}/`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(t("vinkos.inviteText", { url: refUrl }))}`;
  const ladderMin = Math.min(...eco.daily_bonus), ladderMax = Math.max(...eco.daily_bonus);

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-5 pb-28 pt-2">
      <header className="flex h-[52px] items-center justify-between">
        <Link href="/perfil" aria-label={t("nav.perfil")}
          className="grid h-10 w-10 place-items-center rounded-full border border-[var(--line)] bg-[var(--ink2)] text-[var(--cream)]">
          <ChevronLeft size={20} aria-hidden />
        </Link>
        <h1 className="text-[17px] font-black text-[var(--cream)]">{t("saldo.title")}</h1>
        <span aria-hidden className="w-10" />
      </header>

      {/* saldo */}
      <section className="flex items-center gap-3.5 rounded-[20px] border border-[var(--line)] bg-[var(--ink2)] p-4">
        <VinkoCoin size={46} />
        <div className="min-w-0">
          <div className="mono text-[34px] font-black leading-none text-[var(--cream)]">{points.toLocaleString("es-CO")}</div>
          <div className="mt-1.5 text-[14px] text-[var(--muted)]">{t("perfil13.vinkos")}</div>
        </div>
      </section>

      {/* racha semanal + regalo diario + nivel (XP) */}
      <VinkosStreak
        streakDays={p?.streak_days ?? 0}
        streakBest={p?.streak_best ?? 0}
        shields={p?.streak_shields ?? 0}
        streakLast={p?.streak_last ?? null}
        prizePts={eco.streak7_pts}
        bonusClaimedToday={bonusLast === today}
        bonusStep={bonusStep}
        bonusPts={bonusPts}
        bonusTotal={eco.daily_bonus.length}
        xp={p?.xp ?? 0}
      />

      {/* goteo + anuncios recompensados */}
      <SaldoClient
        adPts={eco.ad_reward_pts}
        isAdult={isAdult}
        shields={p?.streak_shields ?? 0}
        recoverable={recoverable}
        brokenDays={p?.streak_broken_days ?? 0}
      />

      {/* TU ENLACE: la invitación validada (0030). Se pagan los dos en el primer pick. */}
      <section className="flex flex-col gap-2.5 rounded-[20px] border border-[var(--gold)]/40 bg-[var(--ink2)] p-4">
        <h2 className="eyebrow text-[11px] text-[var(--gold)]">{t("vinkos.refTitle")}</h2>
        <p className="text-[14px] leading-snug text-[var(--cream)]">
          {t("vinkos.refBody", { n: String(eco.invite_pts), m: String(eco.invitee_pts) })}
        </p>
        <p className="mono select-all break-all rounded-[12px] bg-[var(--ink3)] px-3 py-2 text-[12px] text-[var(--gold)]">{refUrl}</p>
        <a href={waHref} target="_blank" rel="noopener noreferrer"
          className="flex h-12 items-center justify-center rounded-full bg-[#25D366] px-4 text-[15px] font-black text-white">
          {t("vinkos.refWa")}
        </a>
      </section>

      {/* CÓMO SE GANAN: lo que paga el servidor, ni más ni menos */}
      <section className="flex flex-col gap-2">
        <h2 className="eyebrow text-[11px]">{t("vinkos.earn")}</h2>
        <EarnRow icon="📲" title={t("vinkos.earn.share")} sub={t("vinkos.earn.shareSub")} value={`+${SHARE_PTS}`} href="/feed" />
        <EarnRow icon="🤝" title={t("vinkos.earn.invite")} sub={t("vinkos.earn.inviteSub", { m: String(eco.invitee_pts) })} value={`+${eco.invite_pts}`} />
        <EarnRow icon="👥" title={t("vinkos.earn.creator")} sub={t("vinkos.earn.creatorSub", { cap: String(CREATOR_CAP) })} value={`+${CREATOR_PTS}`} href="/nueva" />
        <EarnRow icon="🎁" title={t("vinkos.earn.daily")} sub={t("vinkos.earn.dailySub", { total: String(eco.daily_bonus.length) })} value={`${ladderMin}→${ladderMax}`} />
        <EarnRow icon="🔥" title={t("vinkos.earn.streak")} sub={t("vinkos.earn.streakSub")} value={`+${eco.streak7_pts}`} href="/feed" />
        {isAdult && (
          <EarnRow icon="📺" title={t("vinkos.earn.ad")} sub={t("vinkos.earn.adSub", { cap: String(eco.ad_reward_daily_cap) })} value={`+${eco.ad_reward_pts}`} />
        )}
        <p className="mt-1 text-center text-[11px] text-[var(--muted2)]">{t("saldo.adNote")}</p>
      </section>

      <AppNav />
    </main>
  );
}

// Sin sesión o sin año de nacimiento: un paso antes de ver los Vinkos.
function Aviso({ text, cta, href }: { text: string; cta: string; href: string }) {
  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo mark={44} word={28} />
      <p className="text-sm text-[var(--muted)]">{text}</p>
      <Link href={href}
        className="rounded-full bg-[var(--win)] px-6 py-3 text-[15px] font-black text-[var(--ink)]"
        style={{ boxShadow: "0 5px 0 var(--windeep)" }}>
        {cta}
      </Link>
    </main>
  );
}

// Fila de "cómo se gana": enlaza a donde se gana (si no es en esta misma pantalla).
function EarnRow({ icon, title, sub, value, href }: { icon: string; title: string; sub: string; value: string; href?: string }) {
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="text-lg leading-none">{icon}</span>
        <span className="min-w-0">
          <span className="block text-[14px] font-bold leading-tight text-[var(--cream)]">{title}</span>
          <span className="block text-[11.5px] leading-tight text-[var(--muted)]">{sub}</span>
        </span>
      </span>
      <span className="mono flex shrink-0 items-center gap-1 text-sm font-black text-[var(--win)]">
        <VinkoCoin size={13} />{value}
      </span>
    </>
  );
  const cls = "flex items-center justify-between gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3";
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}
