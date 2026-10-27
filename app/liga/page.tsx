import Link from "next/link";
import type { Metadata } from "next";
import { Clock, Crown } from "lucide-react";
import { getMemberSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { getConfig } from "@/lib/config";
import { fetchMe } from "@/lib/me";
import { whenLabel } from "@/lib/when";
import { Avatar } from "@/components/feed/Avatar";
import { Logo } from "@/components/Logo";
import { AppNav } from "@/components/AppNav";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: t("liga.title"), robots: { index: false, follow: false } };

// LIGA (VINKO_PANTALLAS 12): tu grupo de liga de esta semana. Zona de ascenso
// arriba, tu zona en medio, zona de descenso abajo; las zonas siguen EXACTAMENTE
// a cron_league_close: suben los `league_promote` primeros con puntos (nunca
// desde Leyenda) y bajan los últimos si el grupo es mayor que la zona (nunca
// desde Bronce ni Leyenda). Sin premio de la semana: REGLAS-LEGALES §3 (nada
// de premios con valor, ni «cosas»), aunque el diseño traiga uno patrocinado.

const DIV: Record<string, string> = {
  bronce: "Bronce", plata: "Plata", oro: "Oro", diamante: "Diamante", leyenda: "Leyenda",
};

function weekStartUTC(): string {
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7; // lunes=0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

type Row = { user_id: string; handle: string; avatar_url: string | null; score: number; rank: number; me: boolean };

export default async function Liga() {
  const session = await getMemberSession();
  if (!session) {
    return (
      <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 px-6 text-center">
        <Logo mark={44} word={28} />
        <p className="text-sm text-[var(--muted)]">{t("liga.none")}</p>
        <Link href="/login?next=/liga" className="rounded-full bg-[var(--win)] px-6 py-3 text-[15px] font-black text-[var(--ink)]"
          style={{ boxShadow: "0 5px 0 var(--windeep)" }}>
          {t("saldo.loginCta")}
        </Link>
      </main>
    );
  }

  const sb = await supabaseServer();
  const week = weekStartUTC();
  const [misc, me, { data: myGroup }, { data: season }] = await Promise.all([
    getConfig("misc"),
    fetchMe(sb!),
    sb!.from("league_members")
      .select("group_id, league_groups!inner ( week_start, division, market )")
      .eq("user_id", session.id)
      .eq("league_groups.week_start", week)
      .maybeSingle(),
    sb!.from("seasons").select("number, starts_at")
      .lte("starts_at", week).gte("ends_at", week)
      .order("number", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const zone = Number(misc.league_promote ?? 5);
  const tz = me?.tz ?? "America/Bogota";
  const lg = (myGroup ? (Array.isArray(myGroup.league_groups) ? myGroup.league_groups[0] : myGroup.league_groups) : null) as
    { week_start: string; division: string; market: string | null } | null;
  const division = lg?.division ?? me?.division ?? "bronce";

  let rows: Row[] = [];
  let marketName: string | null = null;
  if (myGroup?.group_id) {
    const [{ data: members }, mk] = await Promise.all([
      sb!.from("league_members").select("user_id, score, profiles ( handle, avatar_url )").eq("group_id", myGroup.group_id),
      lg?.market ? sb!.from("markets").select("name").eq("code", lg.market).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    marketName = (mk.data as { name?: string } | null)?.name ?? null;
    const sorted = (members ?? [])
      .map((m: { user_id: string; score: number; profiles: unknown }) => {
        const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { handle?: string; avatar_url?: string | null } | null;
        return { user_id: m.user_id, handle: p?.handle ?? "?", avatar_url: p?.avatar_url ?? null, score: m.score, me: m.user_id === session.id };
      })
      .sort((a, b) => b.score - a.score || a.handle.localeCompare(b.handle));
    rows = sorted.map((r) => ({ ...r, rank: sorted.findIndex((x) => x.score === r.score) + 1 }));
  }

  const n = rows.length;
  const hasUp = division !== "leyenda";
  const hasDown = n > zone && division !== "bronce" && division !== "leyenda";
  const inUp = (r: Row) => hasUp && r.rank <= zone;
  const inDown = (r: Row) => hasDown && r.rank > n - zone;
  const meIdx = rows.findIndex((r) => r.me);
  const my = meIdx >= 0 ? rows[meIdx] : null;
  const weekNo = season?.starts_at
    ? Math.floor((Date.parse(week) - Date.parse(season.starts_at)) / (7 * 86400000)) + 1 : null;
  const closesAt = new Date(Date.parse(`${week}T00:00:00Z`) + 7 * 86400000).toISOString();

  // Filas que se ven: con grupos pequeños, todas; si no, la zona de ascenso,
  // tu vecindario (±1) y la zona de descenso, con «···» entre medias.
  const show = new Set<number>();
  rows.forEach((r, i) => {
    if (n <= 12 || inUp(r) || inDown(r) || Math.abs(i - meIdx) <= 1) show.add(i);
  });
  const shown = [...show].sort((a, b) => a - b);

  function sub(r: Row, i: number): string | null {
    if (r.me) {
      if (inUp(r)) return r.score > 0 ? t("liga12.inUp") : t("liga12.needScore");
      if (inDown(r)) return t("liga12.inDown", { n: String(Math.max(1, rows[n - zone - 1].score - r.score)) });
      if (hasUp && n > zone) return t("liga12.toUp", { n: String(Math.max(1, rows[zone - 1].score - r.score)) });
      return null;
    }
    if (my && i === meIdx + 1) return t("liga12.belowYou", { n: String(my.score - r.score) });
    if (hasUp && r.rank === zone && n > zone) return t("liga12.lastUp");
    return null;
  }

  return (
    <main className="amb mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-[18px] pb-28 pt-6">
      <p className="mono text-[13px] font-bold uppercase tracking-[0.14em] text-[var(--win)]">
        {marketName ? t("liga12.eyebrow", { market: marketName }) : t("liga.title")}
        {weekNo && weekNo > 0 ? ` · ${t("liga12.week", { n: String(weekNo) })}` : ""}
      </p>
      <h1 className="mt-1.5 text-[38px] font-black leading-[1.02] tracking-[-0.03em] text-[var(--cream)]">
        {t("liga12.division", { name: DIV[division] ?? division })}
      </h1>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="mono inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--ink3)] px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--cream)]">
          <Clock size={14} aria-hidden /> {t("liga12.closes", { when: whenLabel(closesAt, tz) })}
        </span>
        {n > 0 && (
          <span className="mono inline-flex h-8 items-center rounded-full border border-[var(--line)] bg-[var(--ink3)] px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--cream)]">
            {t("liga12.people", { n: String(n) })}
          </span>
        )}
      </div>

      {n === 0 ? (
        <p className="mt-6 rounded-[20px] border border-dashed border-[var(--line2)] p-4 text-center text-[14px] text-[var(--muted)]">{t("liga.none")}</p>
      ) : (
        <div className="mt-5 flex flex-col">
          {shown.map((i, k) => {
            const r = rows[i];
            const prev = k > 0 ? shown[k - 1] : -1;
            const gap = k > 0 && i - prev > 1;
            const upStart = inUp(r) && (k === 0 || !inUp(rows[prev]));
            const downStart = inDown(r) && (k === 0 || !inDown(rows[prev]));
            const rail = inUp(r) ? "var(--win)" : inDown(r) ? "var(--muted2)" : "transparent";
            const s = sub(r, i);
            const crown = r.rank === 1 && r.score > 0;
            return (
              <div key={r.user_id}>
                {gap && <div aria-hidden className="py-2 text-center tracking-[0.5em] text-[var(--muted2)]">···</div>}
                {upStart && (
                  <ZoneHead color="var(--win)" title={t("liga12.zoneUp")} sub={t("liga12.zoneUpSub", { n: String(zone) })} />
                )}
                {downStart && (
                  <ZoneHead color="var(--muted2)" title={t("liga12.zoneDown")} sub={t("liga12.zoneDownSub", { n: String(zone) })} />
                )}
                <div className="border-l-[3px] py-1 pl-2" style={{ borderColor: rail }}>
                  <div className="flex items-center gap-3 rounded-[18px] border px-3 py-2.5"
                    style={{ borderColor: r.me ? "rgba(31,224,122,0.35)" : "transparent", background: r.me ? "rgba(31,224,122,0.10)" : "transparent" }}>
                    <span className="mono w-7 text-center text-[17px] font-bold" style={{ color: crown ? "var(--gold)" : "var(--muted)" }}>{r.rank}</span>
                    <span className="relative">
                      {crown && <Crown size={20} aria-hidden className="absolute -top-4 left-1/2 -translate-x-1/2 text-[var(--gold)]" />}
                      <Avatar handle={r.handle} url={r.avatar_url} size={44} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[17px] font-bold text-[var(--cream)]">{r.me ? t("liga12.you") : `@${r.handle}`}</span>
                      {s && <span className="block truncate text-[13.5px] text-[var(--muted)]">{s}</span>}
                    </span>
                    <span className="mono shrink-0 text-[19px] font-bold text-[var(--cream)]">{r.score}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <AppNav />
    </main>
  );
}

function ZoneHead({ color, title, sub }: { color: string; title: string; sub: string }) {
  return (
    <div className="mb-1 mt-3 flex items-center gap-2 text-[14px] font-bold" style={{ color }}>
      <span aria-hidden className="h-3 w-3 rounded-[3px]" style={{ background: color }} />
      <span className="uppercase">{title}</span>
      <span className="font-semibold">· {sub}</span>
    </div>
  );
}
