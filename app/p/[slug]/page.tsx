import type { Metadata } from "next";
import Link from "next/link";
import { getPorraBySlug, getPorraExtras } from "@/lib/porras";
import { getSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { PickPanel } from "@/components/PickPanel";
import { MoneyMount } from "@/components/money/MoneyMount";
import { moneyForPorra } from "@/lib/money/server";
import { loadMoneyDict } from "@/lib/money/i18n";
import { ResolvePanel } from "@/components/ResolvePanel";
import { ArbiterPanel } from "@/components/ArbiterPanel";
import { DisputePanel, type DisputeState } from "@/components/DisputePanel";
import { PorraRanking, type RankingRow } from "@/components/PorraRanking";
import { FastVideo } from "@/components/FastVideo";
import { PorraCover } from "@/components/PorraCover";
import { PorraSocial } from "@/components/PorraSocial";
import { ShareWhatsApp } from "@/components/ShareWhatsApp";
import { porraUrl, SITE } from "@/lib/share";
import { ogVersion } from "@/lib/og";
import { thumbOf } from "@/lib/thumb";
import { t } from "@/lib/i18n";

// SSR por petición: los roles (creador / juez / admin) salen de la sesión y el
// estado (abierta / cerrada / resuelta / impugnada) cambia con el tiempo, así
// que la página no se cachea. HTML usable sin JS (título, opciones y ranking
// van en el HTML). Cero scripts de anuncios aquí.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

// Plantillas = cero picks (regla de datos): NO se pintan porcentajes falsos.
const OPT_ACCENT = ["var(--win)", "var(--gold)", "var(--win)", "var(--gold)", "var(--win)", "var(--gold)"];
const OPT_LETTER = ["A", "B", "C", "D", "E", "F"];
const UUID = /^[0-9a-f-]{36}$/;

// Reputación del juez (judge_stats, 0042).
type JudgeStats = {
  handle: string | null;
  resolved: number;
  disputed: number;
  upheld: number;
  median_sla_minutes: number | null;
};

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
  const og = `${SITE}/p/${slug}/opengraph-image?v=${ogVersion()}`;
  return {
    title: porra.title,
    description: t("og.description"),
    openGraph: {
      title: porra.title,
      description: t("og.description"),
      siteName: t("brand"),
      type: "website",
      // ?v= = cubo de 10 min alineado con revalidate=600 de la OG: WhatsApp vuelve a pedirla.
      images: [{ url: og, width: 1200, height: 630, alt: porra.title }],
    },
    twitter: { card: "summary_large_image", images: [og] },
  };
}

export default async function PorraPage({ params }: Props) {
  const { slug } = await params;
  const [porra, session, sb] = await Promise.all([getPorraBySlug(slug), getSession(), supabaseServer()]);

  if (!porra) return <NotAvailable />;

  const isReal = !porra.is_template && UUID.test(porra.id);
  const closed = Date.parse(porra.closes_at) <= Date.now();
  // resolved = reparto hecho; disputed = reparto congelado (provisional) mientras Vinko revisa.
  const settled = porra.status === "resolved" || porra.status === "disputed";
  const needRanking = isReal && (settled || (porra.status === "open" && closed));
  // Juez efectivo: árbitro aceptado; si no, el creador.
  const judgeId = porra.arbiter_status === "accepted" && porra.arbiter_id ? porra.arbiter_id : (porra.created_by ?? null);

  // En paralelo: ¿es admin?, ranking (si procede), motivo de anulación, columnas
  // opcionales (criterio, fechas), estado de la impugnación y reputación del juez.
  const [adminRes, rankRes, voidRes, extras, disputeRes, judgeRes] = await Promise.all([
    session && sb ? sb.rpc("is_admin") : null,
    needRanking && sb ? sb.rpc("porra_ranking", { p_porra: porra.id }) : null,
    porra.status === "taken_down" && isReal && sb
      ? sb.from("porras").select("void_reason").eq("id", porra.id).maybeSingle() : null,
    isReal ? getPorraExtras(sb, porra.id) : null,
    isReal && settled && sb ? sb.rpc("porra_dispute_state", { p_porra: porra.id }) : null,
    isReal && judgeId && sb ? sb.rpc("judge_stats", { p_user: judgeId }) : null,
  ]);

  if (porra.status === "taken_down") {
    const reason = (voidRes?.data as { void_reason?: string | null } | null)?.void_reason ?? null;
    return <NotAvailable voidReason={reason} />;
  }

  const uid = session?.id ?? null;
  const isAdmin = adminRes?.data === true;
  const isCreator = !!uid && porra.created_by === uid;
  const isJudge = isCreator || (!!uid && porra.arbiter_id === uid && porra.arbiter_status === "accepted");
  const isInvited = !!uid && porra.arbiter_id === uid && porra.arbiter_status === "invited";
  const open = porra.status === "open";
  const canResolve = isReal && open && (isAdmin || (isJudge && closed));
  const canVoid = isReal && open && (isAdmin || isCreator);
  const resolved = porra.status === "resolved";
  const disputed = porra.status === "disputed";
  const rows = rankRes && !rankRes.error ? ((rankRes.data ?? []) as RankingRow[]) : null;
  const options = porra.options.map((o) => ({ id: o.id, label: o.label }));
  const dispute = disputeRes && !disputeRes.error ? ((disputeRes.data ?? null) as DisputeState | null) : null;
  const judge = judgeRes && !judgeRes.error ? ((judgeRes.data ?? null) as JudgeStats | null) : null;
  const criteria = extras?.resolution_criteria?.trim() || null;
  const resolvesAt = extras?.resolves_at ?? null;
  const outcome = extras?.dispute_outcome ?? null;

  // Modalidad de dinero (M0, §B4): solo si la porra tiene bolsa elegible y está
  // abierta. moneyForPorra devuelve null salvo bolsa real; loadMoneyDict devuelve
  // null en producción sin copy aprobado → la UI de dinero no se monta.
  const money = isReal && open && !closed ? await moneyForPorra(porra.id, session) : null;
  const moneyDict = money ? await loadMoneyDict("es") : null;

  return (
    // ESCRITORIO (lg+): dos columnas — el vídeo/portada a la izquierda como
    // tarjeta 9:16 pegajosa y el resto a la derecha. Móvil: intacto (una sola
    // columna; el <div> de la derecha reproduce el mismo flex-col gap-5).
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pb-8 pt-6 lg:grid lg:max-w-[1040px] lg:grid-cols-[420px_1fr] lg:grid-rows-[auto_1fr] lg:gap-8 lg:px-8 lg:pt-8">
      <header className="flex items-center justify-between lg:col-span-2">
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

      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--ink2)] lg:sticky lg:top-8 lg:aspect-[9/16] lg:max-h-[82vh] lg:self-start">
        {porra.video ? (
          <FastVideo src={porra.video} poster={thumbOf(porra.video) ?? undefined} speed={1.5} eager
            fallback={<PorraCover title={porra.title} category={porra.category} />} />
        ) : (
          <PorraCover title={porra.title} category={porra.category} />
        )}
      </div>

      <div className="flex grow flex-col gap-5 lg:min-w-0">
        <p className="mono text-xs uppercase tracking-[0.1em]" style={{ color: disputed || (open && closed) ? "var(--gold)" : "var(--muted)" }}>
          {disputed ? t("p.inReview") : resolved ? t("p.resolved") : closed ? t("resolve.closedTag") : t("p.closes", { date: fmtDate(porra.closes_at) })}
        </p>

        <h1 className="text-[1.7rem] font-black leading-[1.12] tracking-tight text-[var(--cream)] [text-wrap:balance]">
          {porra.title}
        </h1>

        {/* Criterio de resolución (0041) y fecha prevista: la promesa del juez */}
        {(criteria || (open && resolvesAt)) && (
          <div className="-mt-2 flex flex-col gap-0.5 text-[13px] text-[var(--muted)]">
            {criteria && <p>{t("p.criteria", { c: criteria })}</p>}
            {open && resolvesAt && <p className="mono text-[11px] uppercase tracking-[0.1em]">{t("p.resolvesAt", { date: fmtDate(resolvesAt) })}</p>}
          </div>
        )}

        {/* IMPUGNADA: reparto congelado hasta que Vinko decida (SSR, sin JS) */}
        {disputed && (
          <div role="status" className="rounded-[14px] border border-[var(--gold)] bg-[rgba(255,194,61,0.08)] px-4 py-3">
            <p className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--gold)]">{t("p.inReview")}</p>
            <p className="mt-1 text-[13px] text-[var(--cream)]">{t("p.inReviewBody")}</p>
          </div>
        )}
        {resolved && outcome === "reversed" && (
          <p className="rounded-[14px] border border-[var(--line)] px-4 py-2.5 text-[13px] text-[var(--muted)]">{t("dispute.reversed")}</p>
        )}
        {resolved && outcome === "upheld" && (
          <p className="rounded-[14px] border border-[var(--line)] px-4 py-2.5 text-[13px] text-[var(--muted)]">{t("dispute.upheld")}</p>
        )}

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

        {/* JUEZ con su reputación (judge_stats): quién decide y cuánto fiarse */}
        {judge?.handle && (
          <p className="-mt-2 text-[12px] text-[var(--muted)]">
            ⚖️ <Link href={`/u/${judge.handle}`} className="font-bold text-[var(--cream)]">@{judge.handle}</Link>
            {" · "}
            {judge.resolved > 0
              ? t("p.judgeTrust", { n: String(judge.resolved), d: String(judge.disputed) })
              : t("p.judgeNew")}
          </p>
        )}

        {/* JUEZ — invitación pendiente, o resolver/anular si ya cerró (admin: siempre) */}
        {isReal && open && isInvited && <ArbiterPanel porraId={porra.id} slug={porra.slug} />}
        {(canResolve || canVoid) && (
          <ResolvePanel porraId={porra.id} options={options} source={porra.source}
            canResolve={canResolve} canVoid={canVoid} early={!closed} criteria={criteria} />
        )}

        <PickPanel
          porraId={porra.id}
          slug={porra.slug}
          options={options}
          status={porra.status}
          isTemplate={porra.is_template}
          closesAt={porra.closes_at}
        />

        {money && moneyDict && <MoneyMount view={money} slug={slug} dict={moneyDict} options={options} />}

        {/* RANKING de ESA porra (SSR): quién puso qué y qué cobra (provisional si está impugnada) */}
        {rows && (
          <PorraRanking rows={rows} options={options} winningOptionId={porra.winning_option_id} status={porra.status} />
        )}

        {/* IMPUGNAR: participantes reales, 24 h tras resolver; "Impugnada por N" ya va en el HTML */}
        {isReal && settled && dispute && <DisputePanel porraId={porra.id} state={dispute} />}

        {/* COMPARTIR — aquí aterriza quien recibe el enlace, y desde aquí lo reenvía */}
        {!porra.is_template && open && !closed && (
          <ShareWhatsApp text={t("nueva.shareText", { title: porra.title, url: porraUrl(porra.slug) + (session?.handle && !session.is_anonymous ? `?ref=${session.handle}` : "") })}
            porraId={porra.id}
            className="flex items-center justify-center gap-2 rounded-[14px] bg-[#25D366] px-4 py-3.5 text-[15px] font-black text-white">
            {t("p.shareWa")}
          </ShareWhatsApp>
        )}

        {!porra.is_template && <PorraSocial porraId={porra.id} slug={porra.slug} />}

        <footer className="mt-auto flex flex-col gap-1.5 pt-6">
          <p className="mono text-[11px] uppercase tracking-[0.1em] text-[var(--muted2)]">
            {t("og.footer")}
          </p>
          <p className="text-xs text-[var(--muted)]">{t("p.judge")}</p>
          <p className="text-xs text-[var(--muted)]">{t("p.pointsNote")}</p>
          <nav className="mt-1 flex gap-3 text-[11px] text-[var(--muted2)]">
            <Link href="/privacidad" className="underline">{t("legal.privacy.title")}</Link>
            <Link href="/terminos" className="underline">{t("legal.terms.title")}</Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}

// Retirada o anulada. Si se anuló (void_porra), quien puede verla (creador,
// admin, compañeros de grupo) sabe que los Vinkos ya volvieron y por qué.
function NotAvailable({ voidReason = null }: { voidReason?: string | null }) {
  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo mark={44} word={28} />
      <p className="text-lg font-bold">{t("p.notAvailable")}</p>
      {voidReason !== null && (
        <div className="rounded-[12px] border border-[var(--gold)] px-4 py-3">
          <p className="text-[13px] font-black text-[var(--gold)]">{t("resolve.voided")}</p>
          {voidReason && <p className="mt-1 text-xs text-[var(--muted)]">{t("resolve.voidedReason", { reason: voidReason })}</p>}
        </div>
      )}
      <Link href="/" className="mono text-xs uppercase tracking-widest text-[var(--win)]">
        {t("p.backHome")}
      </Link>
    </main>
  );
}
