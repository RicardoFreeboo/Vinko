import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { SaldoClient } from "@/components/SaldoClient";
import { EuroWallet } from "@/components/EuroWallet";
import { CarteraTabs } from "@/components/CarteraTabs";
import { getWallet } from "@/lib/money/wallet";
import { getMoneyConfig } from "@/lib/money/config";
import { ClubCard } from "@/components/ClubCard";
import { getClubConfig, stripeConfigured } from "@/lib/club";
import { VinkosStreak } from "@/components/VinkosStreak";
import { VinkoCoin } from "@/components/VinkoCoin";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { madridClock } from "@/lib/gate";
import { SITE } from "@/lib/share";
import { t } from "@/lib/i18n";

// Saldo + anuncios recompensados (placements R1/R2/R3/R6, §4.3). El crédito
// SIEMPRE lo hace el servidor (Edge Function → grant_ad_reward_v2). Los
// anuncios dan utilidad (PTS, escudo, boost), JAMÁS marcador (§0.2).
//
// La lista "cómo se ganan Vinkos" sale de remote_config (economy/ads) + de
// las cifras fijas de las RPC (0030): así la pantalla dice EXACTAMENTE lo que
// paga el servidor. Si remote_config no se puede leer, constantes de abajo.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: t("cartera.title"),
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
  const session = await getSession();

  if (!session) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-sm text-[var(--muted)]">{t("saldo.login")}</p>
        <Link
          href="/login?next=/cartera"
          className="rounded-[12px] bg-[var(--win)] px-5 py-3 text-[15px] font-black text-[var(--ink)]"
        >
          {t("saldo.loginCta")}
        </Link>
      </main>
    );
  }

  if (!session.birth_year) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-sm text-[var(--muted)]">{t("saldo.age")}</p>
        <Link
          href="/bienvenida?next=/cartera"
          className="rounded-[12px] bg-[var(--win)] px-5 py-3 text-[15px] font-black text-[var(--ink)]"
        >
          {t("saldo.ageCta")}
        </Link>
      </main>
    );
  }

  const sb = await supabaseServer();
  const [{ data: p }, { data: cfgRows }] = await Promise.all([
    sb!.from("profiles")
      .select("points, xp, marcador_total, streak_days, streak_best, streak_last, streak_shields, streak_broken_days, streak_recover_until, division, daily_bonus_last, daily_bonus_step, role, club_active, country, safer_play")
      .eq("id", session.id)
      .maybeSingle(),
    sb!.from("remote_config").select("key, value").in("key", ["economy", "ads"]),
  ]);
  const eco = readEconomy(cfgRows);
  const club = await getClubConfig(sb);

  const today = madridClock().day;
  const isAdult = new Date().getFullYear() - session.birth_year >= 18;

  // Euros (motor fase 2): saldo del proveedor + si el país los tiene encendidos.
  // Hoy apagado en todos → wallet a cero y eurosEnabled=false. Solo +18.
  const wallet = isAdult ? await getWallet(sb) : null;
  const moneyCfg = await getMoneyConfig(sb);
  const cc = ((p as { country?: string | null } | null)?.country ?? "").toUpperCase();
  const cEntry = moneyCfg.countries[cc];
  // Juego más seguro (§5.11): la autoexclusión del usuario apaga su UI de euros.
  const sp = ((p as { safer_play?: { self_excluded_until?: string | null } | null } | null)?.safer_play) ?? null;
  const excludedUntil = sp?.self_excluded_until ?? null;
  const isSelfExcluded = !!excludedUntil && new Date(excludedUntil) > new Date();
  const eurosEnabled = isAdult && !isSelfExcluded && !moneyCfg.global.kill_switch && !!cEntry?.enabled && (cEntry.mode === "partner" || cEntry.mode === "own");
  const recoverable =
    !!p?.streak_recover_until && new Date(p.streak_recover_until) > new Date() &&
    (p?.streak_broken_days ?? 0) > 0;

  // Regalo diario: mismo cálculo que claim_daily_bonus (ayer → siguiente
  // peldaño; si no, vuelve al 1).
  const bonusLast = (p?.daily_bonus_last as string | null) ?? null;
  const bonusStep = bonusLast === yesterdayOf(today)
    ? Math.min((p?.daily_bonus_step ?? 0) + 1, eco.daily_bonus.length) : 1;
  const bonusPts = eco.daily_bonus[bonusStep - 1] ?? eco.daily_bonus[0];

  const refUrl = session.handle ? `${SITE}/?ref=${encodeURIComponent(session.handle)}` : `${SITE}/`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(t("vinkos.inviteText", { url: refUrl }))}`;
  const ladderMin = Math.min(...eco.daily_bonus), ladderMax = Math.max(...eco.daily_bonus);

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pb-24 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={28} word={20} />
        <span className="mono flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <VinkoCoin size={14} />{p?.points ?? session.points ?? 0} · @{session.handle}
        </span>
      </header>
      {/* Dos pestañas: Vinkos (puntos, economía viva) y Euros (motor del proveedor,
          custodia fuera del núcleo). No se mezclan (diseño §3.3). */}
      <CarteraTabs
        vinkos={<>
          {/* RACHA SEMANAL real + regalo diario + nivel (XP) */}
          <VinkosStreak
            streakDays={p?.streak_days ?? 0}
            streakBest={p?.streak_best ?? 0}
            shields={p?.streak_shields ?? 0}
            streakLast={(p?.streak_last as string | null) ?? null}
            prizePts={eco.streak7_pts}
            bonusClaimedToday={bonusLast === today}
            bonusStep={bonusStep}
            bonusPts={bonusPts}
            bonusTotal={eco.daily_bonus.length}
            xp={p?.xp ?? 0}
          />
          <SaldoClient
            initialPoints={p?.points ?? 0}
            xp={p?.xp ?? 0}
            marcador={p?.marcador_total ?? 0}
            division={p?.division ?? "bronce"}
            shields={p?.streak_shields ?? 0}
            isAdult={isAdult}
            recoverable={recoverable}
            brokenDays={p?.streak_broken_days ?? 0}
          />
          {/* TU ENLACE: la invitación validada (0030). Se pagan los dos en el primer pick. */}
          <section className="flex flex-col gap-2 rounded-[16px] border border-[var(--gold)]/40 bg-[var(--ink2)] p-4">
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("vinkos.refTitle")}</p>
            <p className="text-[13px] leading-snug text-[var(--cream)]">
              {t("vinkos.refBody", { n: String(eco.invite_pts), m: String(eco.invitee_pts) })}
            </p>
            <p className="mono select-all break-all rounded-[10px] bg-[var(--ink3)] px-3 py-2 text-[12px] text-[var(--gold)]">{refUrl}</p>
            <a href={waHref} target="_blank" rel="noopener noreferrer"
              className="rounded-[12px] bg-[#25D366] px-4 py-3 text-center text-[14px] font-black text-white">
              {t("vinkos.refWa")}
            </a>
          </section>
          {/* CÓMO SE GANAN (aquí está la "recarga" de Vinkos: regalo diario y anuncio) */}
          <section className="flex flex-col gap-2">
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{t("vinkos.earn")}</p>
            <EarnRow icon="📲" title={t("vinkos.earn.share")} sub={t("vinkos.earn.shareSub")} value={`+${SHARE_PTS}`} href="/feed" />
            <EarnRow icon="🤝" title={t("vinkos.earn.invite")} sub={t("vinkos.earn.inviteSub", { m: String(eco.invitee_pts) })} value={`+${eco.invite_pts}`} href="/cartera" />
            <EarnRow icon="👥" title={t("vinkos.earn.creator")} sub={t("vinkos.earn.creatorSub", { cap: String(CREATOR_CAP) })} value={`+${CREATOR_PTS}`} href="/nueva" />
            <EarnRow icon="🎁" title={t("vinkos.earn.daily")} sub={t("vinkos.earn.dailySub", { total: String(eco.daily_bonus.length) })} value={`${ladderMin}→${ladderMax}`} href="/cartera" />
            <EarnRow icon="🔥" title={t("vinkos.earn.streak")} sub={t("vinkos.earn.streakSub")} value={`+${eco.streak7_pts}`} href="/feed" />
            {isAdult && (
              <EarnRow icon="📺" title={t("vinkos.earn.ad")} sub={t("vinkos.earn.adSub", { cap: String(eco.ad_reward_daily_cap) })} value={`+${eco.ad_reward_pts}`} href="/cartera" />
            )}
            <p className="text-center text-[11px] text-[var(--muted2)]">{t("saldo.adNote")}</p>
          </section>
          {/* Vinko Club: suscripción legal por Stripe (no da Vinkos ni ventaja). */}
          {club.enabled && (stripeConfigured() || (p as { club_active?: boolean } | null)?.club_active) && (
            <ClubCard active={(p as { club_active?: boolean } | null)?.club_active ?? false}
              monthly={club.monthly_minor} annual={club.annual_minor} currency={club.currency} configured={stripeConfigured()} />
          )}
        </>}
        dinero={isAdult
          ? <EuroWallet wallet={wallet} eurosEnabled={eurosEnabled} selfExcludedUntil={isSelfExcluded ? excludedUntil : null} />
          : <p className="rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] p-4 text-[13px] text-[var(--muted)]">{t("cartera.euros18")}</p>}
      />
      <AppNav />
    </main>
  );
}

function EarnRow({ icon, title, sub, value, href }: { icon: string; title: string; sub: string; value: string; href: string }) {
  return (
    <Link href={href}
      className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--ink2)] px-4 py-3">
      <span className="flex min-w-0 items-center gap-3">
        <span className="text-lg leading-none">{icon}</span>
        <span className="min-w-0">
          <span className="block text-[14px] font-bold leading-tight text-[var(--cream)]">{title}</span>
          <span className="block text-[11px] leading-tight text-[var(--muted)]">{sub}</span>
        </span>
      </span>
      <span className="mono flex shrink-0 items-center gap-1 text-sm font-black text-[var(--win)]">
        <VinkoCoin size={13} />{value}
      </span>
    </Link>
  );
}
