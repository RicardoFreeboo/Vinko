import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Flame, ChevronRight } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { getMemberSession } from "@/lib/session";
import { editorialBySlug } from "@/lib/editorial";
import { Logo } from "@/components/Logo";
import { VinkoCoin } from "@/components/VinkoCoin";
import { AppNav } from "@/components/AppNav";
import { ProfileGrid, type Row as GridRow } from "@/components/ProfileGrid";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  return { title: `@${handle}`, robots: { index: false, follow: false } };
}

type Row = { id: string; slug: string; title: string; source: string; status: string; media_url: string | null; media_kind: string | null };
type Receipt = { title: string; pct: number | null; visionario: boolean; punteria: number };

function videoOf(r: Row): string | null {
  return editorialBySlug(r.slug)?.video ?? (r.media_kind === "video" ? r.media_url : null);
}

export default async function UserProfile({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const sb = await supabaseServer();
  if (!sb) notFound();

  const COLS = "id, handle, avatar_url, points, xp, marcador_total, division, streak_days, streak_best";
  type ProfileRow = { id: string; handle: string; avatar_url: string | null; points: number; xp: number; marcador_total: number;
    division: string; streak_days: number; streak_best: number; is_anonymous?: boolean; deleted_at?: string | null };
  // SEC-01 (0055)/profile_public (0059): el servidor decide qué perfil es público.
  let p: ProfileRow | null = null;
  const pub = await sb.rpc("profile_public", { p_handle: handle });
  if (!pub.error) {
    p = (pub.data as ProfileRow | null) ?? null;
  } else if (pub.error.code === "PGRST202" || pub.error.code === "42883") {
    let q = await sb.from("profiles").select(`${COLS}, is_anonymous, deleted_at`).eq("handle", handle).maybeSingle();
    if (q.error) q = await sb.from("profiles").select(COLS).eq("handle", handle).maybeSingle();
    p = q.data as ProfileRow | null;
  }
  if (!p || p.is_anonymous || p.deleted_at) notFound();

  const session = await getMemberSession();
  const isMe = session?.id === p.id;

  const [{ data: created }, { data: played }, { data: stats }, recRes] = await Promise.all([
    sb.rpc("profile_created", { p_user: p.id }),
    sb.rpc("profile_played", { p_user: p.id }),
    sb.rpc("profile_stats", { p_user: p.id }),
    sb.rpc("profile_receipts", { p_user: p.id }), // 0072: Visionario ×N + mejores recibos
  ]);
  const s = (stats ?? {}) as { created?: number; played?: number; hits?: number };
  const rec = (!recRes.error && recRes.data ? recRes.data : {}) as { visionario?: number; receipts?: Receipt[] };
  const receipts = (rec.receipts ?? []) as Receipt[];
  const visionarioN = rec.visionario ?? 0;
  const playedN = s.played ?? 0;
  const hitRate = playedN > 0 ? Math.round(((s.hits ?? 0) / playedN) * 100) : 0;
  const DIV: Record<string, string> = { bronce: "Bronce", plata: "Plata", oro: "Oro", diamante: "Diamante", leyenda: "Leyenda" };

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-5 pb-28 pt-6">
      <header className="flex items-center justify-between">
        <Logo mark={26} word={18} />
        {isMe && (
          <span className="flex items-center gap-3">
            <Link href="/saldo" className="mono text-[11px] text-[var(--win)]">{t("u.edit")}</Link>
            <Link href="/ajustes" aria-label={t("ajustes.title")} className="text-[15px] text-[var(--muted)]">⚙</Link>
          </span>
        )}
      </header>

      {/* cabecera del perfil (centrada, pantalla 13) */}
      <section className="flex flex-col items-center gap-2 text-center">
        {p.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatar_url} alt="" className="h-[88px] w-[88px] rounded-full object-cover" />
        ) : (
          <div className="grid h-[88px] w-[88px] place-items-center rounded-full bg-[var(--ink3)] text-4xl font-black text-[var(--win)]">
            {p.handle?.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="mt-1 text-[1.6rem] font-black leading-none text-[var(--cream)]">@{p.handle}</div>
        <Link href="/temporada" className="mono text-xs text-[var(--gold)] underline-offset-2 hover:underline">
          {DIV[p.division] ?? p.division} · 🔥 {p.streak_days} <span aria-hidden>→</span>
        </Link>
      </section>

      {/* tres tarjetas: Puntería · Racha · Visionario (pantalla 13) */}
      <div className="grid grid-cols-3 gap-2.5">
        <Card label={t("perfil13.hitRate")} value={`${hitRate}%`} />
        <Card
          label={t("perfil13.racha")}
          value={<span className="flex items-center justify-center gap-1 text-[var(--gold)]"><Flame size={22} strokeWidth={2.4} /> {p.streak_days}</span>}
          sub={t("perfil13.rachaBest", { n: String(p.streak_best) })}
        />
        <Card label={t("perfil13.visionario")} value={`×${visionarioN}`} sub={t("perfil13.visionarioSub")} />
      </div>

      {/* saldo de Vinkos */}
      <Link
        href={isMe ? "/saldo" : `/u/${p.handle}`}
        className="flex items-center gap-2.5 rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] px-3.5 py-3"
      >
        <VinkoCoin size={22} />
        <b className="mono text-[17px] text-[var(--cream)]">{p.points.toLocaleString("es-CO")}</b>
        <span className="text-[14px] text-[var(--muted)]">{t("perfil13.vinkos")}</span>
        <span className="flex-1" />
        {isMe && <ChevronRight size={18} className="text-[var(--muted2)]" />}
      </Link>

      {/* mis mejores recibos */}
      {receipts.length > 0 ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="eyebrow text-[var(--muted)]">{t("perfil13.receipts")}</h3>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {receipts.map((r, i) => <Ticket key={i} r={r} />)}
          </div>
        </section>
      ) : isMe ? (
        <p className="rounded-[12px] border border-dashed border-[var(--line)] bg-[var(--ink2)] px-3 py-3 text-center text-[12.5px] text-[var(--muted)]">
          {t("perfil13.noReceipts")}
        </p>
      ) : null}

      {/* rejilla de porras (creadas / jugadas) — se mantiene */}
      <ProfileGrid
        created={((created ?? []) as GridRow[]).map((r) => ({ ...r, video: videoOf(r as unknown as Row) }))}
        played={((played ?? []) as GridRow[]).map((r) => ({ ...r, video: videoOf(r as unknown as Row) }))}
      />

      <AppNav />
    </main>
  );
}

function Card({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] p-3 text-center">
      <div className="eyebrow text-[10px] text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-[26px] font-black leading-none text-[var(--cream)]">{value}</div>
      {sub && <div className="mt-1 text-[12px] text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

// Recibo crema (ticket), estilo pantalla 13 / componente Receipt.
function Ticket({ r }: { r: Receipt }) {
  return (
    <div className="rounded-[12px] p-3" style={{ background: "var(--cream)", color: "var(--ink)" }}>
      <div className="mono text-[10px] font-bold uppercase tracking-[0.06em] opacity-65">
        {t("perfil13.lodije")} · {t("perfil13.loVio", { pct: String(r.pct ?? 0) })}
      </div>
      <div className="mt-1.5 min-h-[42px] text-[14px] font-bold leading-tight">{r.title}</div>
      {r.visionario ? (
        <span className="mt-1.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide" style={{ background: "var(--gold)", color: "var(--ink)" }}>
          {t("perfil13.visionarioBadge")}
        </span>
      ) : (
        <div className="mono mt-2 text-[11px] font-bold" style={{ color: "#0a8f4d" }}>
          {t("perfil13.punteriaGain", { n: String(r.punteria) })}
        </div>
      )}
    </div>
  );
}
