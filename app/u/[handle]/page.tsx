import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Flame, ChevronRight, Settings } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { getMemberSession } from "@/lib/session";
import { fetchMe } from "@/lib/me";
import { editorialBySlug } from "@/lib/editorial";
import { Logo } from "@/components/Logo";
import { VinkoCoin } from "@/components/VinkoCoin";
import { AppNav } from "@/components/AppNav";
import { avatarColor } from "@/components/feed/Avatar";
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

// PERFIL (VINKO_PANTALLAS 13): avatar, nombre, tres tarjetas (Puntería · Racha
// · Visionario), la fila de Vinkos (→ /saldo, solo el tuyo) y tus mejores
// recibos. Debajo, la rejilla de porras creadas/jugadas.
export default async function UserProfile({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const sb = await supabaseServer();
  if (!sb) notFound();

  const COLS = "id, handle, display_name, avatar_url, points, xp, marcador_total, division, streak_days, streak_best";
  type ProfileRow = { id: string; handle: string; display_name?: string | null; avatar_url: string | null; points: number; xp: number;
    marcador_total: number; division: string; streak_days: number; streak_best: number; is_anonymous?: boolean; deleted_at?: string | null };
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

  const [{ data: created }, { data: played }, { data: stats }, recRes, me] = await Promise.all([
    sb.rpc("profile_created", { p_user: p.id }),
    sb.rpc("profile_played", { p_user: p.id }),
    sb.rpc("profile_stats", { p_user: p.id }),
    sb.rpc("profile_receipts", { p_user: p.id }), // 0073: Visionario ×N + mejores recibos
    isMe ? fetchMe(sb) : Promise.resolve(null),   // escudos: columna privada, solo los tuyos
  ]);
  const s = (stats ?? {}) as { created?: number; played?: number; hits?: number };
  const rec = (!recRes.error && recRes.data ? recRes.data : {}) as { visionario?: number; receipts?: Receipt[] };
  const receipts = ((rec.receipts ?? []) as Receipt[]).slice(0, 4);
  const visionarioN = rec.visionario ?? 0;
  const playedN = s.played ?? 0;
  const hitRate = playedN > 0 ? Math.round(((s.hits ?? 0) / playedN) * 100) : 0;
  const shields = me?.streak_shields ?? null;
  const DIV: Record<string, string> = { bronce: "Bronce", plata: "Plata", oro: "Oro", diamante: "Diamante", leyenda: "Leyenda" };
  const name = p.display_name?.trim() || p.handle;

  const vinkos = (
    <>
      <VinkoCoin size={22} />
      <b className="mono text-[17px] text-[var(--cream)]">{p.points.toLocaleString("es-CO")}</b>
      <span className="truncate text-[14px] text-[var(--muted)]">{t("perfil13.vinkos")}</span>
      <span className="flex-1" />
    </>
  );
  const rowCls = "flex items-center gap-2.5 rounded-[14px] border border-[var(--line)] bg-[var(--ink2)] px-3.5 py-3";

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-3 px-[18px] pb-28 pt-2">
      <header className="flex h-[52px] items-center justify-between">
        {isMe ? <span /> : (
          <Link href="/feed" aria-label={t("brand")}><Logo mark={26} word={18} /></Link>
        )}
        {isMe && (
          <Link href="/ajustes" aria-label={t("ajustes.title")}
            className="grid h-10 w-10 place-items-center rounded-full border border-[var(--line)] bg-[var(--ink2)] text-[var(--cream)]">
            <Settings size={19} aria-hidden />
          </Link>
        )}
      </header>

      {/* cabecera del perfil (centrada) */}
      <section className="flex flex-col items-center text-center">
        {p.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatar_url} alt="" className="h-[88px] w-[88px] rounded-full object-cover" />
        ) : (
          <span className="grid h-[88px] w-[88px] place-items-center rounded-full text-[37px] font-bold text-[var(--cream)]"
            style={{ background: avatarColor(p.handle) }}>
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <h1 className="mt-2.5 text-[26px] font-black leading-tight tracking-[-0.03em] text-[var(--cream)]">{name}</h1>
        <p className="text-[14.5px] text-[var(--muted)]">
          @{p.handle} · <Link href="/liga" className="underline-offset-2 hover:underline">{DIV[p.division] ?? p.division}</Link>
        </p>
      </section>

      {/* tres tarjetas: Puntería · Racha · Visionario */}
      <div className="mt-3 grid grid-cols-[1.25fr_1fr_1fr] gap-2">
        <Card label={t("perfil13.hitRate")}
          value={<>{hitRate}<span className="text-[20px]">%</span></>} />
        <Card label={t("perfil13.racha")}
          value={<span className="flex items-center gap-1.5 text-[var(--gold)]"><Flame size={24} strokeWidth={2.4} aria-hidden />{p.streak_days}</span>}
          sub={shields != null
            ? (shields === 1 ? t("perfil13.shield1") : t("perfil13.shields", { n: String(shields) }))
            : t("perfil13.rachaBest", { n: String(p.streak_best) })} />
        <Card label={t("perfil13.visionario")} value={`×${visionarioN}`} sub={t("perfil13.visionarioSub")} />
      </div>

      {/* Vinkos: el tuyo lleva a /saldo (regalo diario, anuncios, invitar) */}
      {isMe ? (
        <Link href="/saldo" className={rowCls}>
          {vinkos}
          <ChevronRight size={18} aria-hidden className="shrink-0 text-[var(--muted2)]" />
        </Link>
      ) : (
        <div className={rowCls}>{vinkos}</div>
      )}

      {/* mejores recibos */}
      {receipts.length > 0 ? (
        <section className="mt-3">
          <h2 className="mb-2.5 text-[18px] font-bold tracking-[-0.01em] text-[var(--cream)]">
            {isMe ? t("perfil13.receipts") : t("perfil13.receiptsOf")}
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {receipts.map((r, i) => <Ticket key={i} r={r} />)}
          </div>
        </section>
      ) : isMe ? (
        <p className="mt-2 rounded-[14px] border border-dashed border-[var(--line)] bg-[var(--ink2)] px-3 py-3 text-center text-[12.5px] text-[var(--muted)]">
          {t("perfil13.noReceipts")}
        </p>
      ) : null}

      {/* rejilla de porras (creadas / jugadas) */}
      <div className="mt-2">
        <ProfileGrid
          created={((created ?? []) as GridRow[]).map((r) => ({ ...r, video: videoOf(r as unknown as Row) }))}
          played={((played ?? []) as GridRow[]).map((r) => ({ ...r, video: videoOf(r as unknown as Row) }))}
        />
      </div>

      <AppNav active={isMe ? "/perfil" : undefined} />
    </main>
  );
}

// .card del diseño: eyebrow verde, cifra grande, subtítulo apagado.
function Card({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-[20px] border border-[var(--line)] bg-[var(--ink2)] p-[13px]">
      <div className="eyebrow text-[10px]">{label}</div>
      <div className="mt-2 text-[34px] font-black leading-none tracking-[-0.03em] text-[var(--cream)]">{value}</div>
      {sub && <div className="mt-1 text-[12px] leading-snug text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

// Recibo crema (ticket), estilo pantalla 13 / componente Receipt.
function Ticket({ r }: { r: Receipt }) {
  return (
    <div className="rounded-[12px] p-3" style={{ background: "var(--cream)", color: "var(--ink)" }}>
      <div className="mono text-[10px] uppercase tracking-[0.06em] opacity-65">
        {t("perfil13.lodije")} · {t("perfil13.loVio", { pct: String(r.pct ?? 0) })}
      </div>
      <div className="mt-1.5 min-h-[48px] text-[14px] font-bold leading-[1.15]">{r.title}</div>
      {r.visionario ? (
        <span className="mt-1.5 inline-flex h-5 items-center rounded-[7px] px-2 text-[10px] font-extrabold tracking-[0.06em]" style={{ background: "var(--gold)", color: "var(--ink)" }}>
          {t("perfil13.visionarioBadge")}
        </span>
      ) : (
        <span className="mono mt-2 block text-[11px] font-bold" style={{ color: "#0a8f4d" }}>
          {t("perfil13.punteriaGain", { n: String(r.punteria) })}
        </span>
      )}
    </div>
  );
}
