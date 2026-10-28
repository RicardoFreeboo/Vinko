// Edge Function: POST /sports-provider — calendario y resultados deportivos del
// motor de contenido (F2, 27-oct-2026; doc B.5, B.9.2 y B.14).
//
// body.mode = "calendar": trae de API-Football los partidos de los próximos 7
//   días de las competiciones de remote_config.content_engine.sports, los guarda
//   en content_events y crea la plantilla Nivel A «¿Quién gana X vs Y?» de los
//   que empiezan entre 3 h y 48 h (topic_proposals 'scheduled'; la publica
//   content_publish_due, 0081). Como mucho una sincronización cada
//   sports.calendar_every_h horas (6 por defecto: el plan gratis da 100
//   llamadas al día).
// body.mode = "results": mira los partidos recientes y decide (./deportes.ts):
//   final → propuesta de resultado (tiempo reglamentario) 15 min después;
//   aplazado → amplía el plazo o anula; cancelado, suspendido o en los
//   despachos → anula con devolución (y en los despachos, aviso al admin);
//   corrección del proveedor en las 2 h siguientes → aviso, nunca re-resuelve.
//
// MODO SOMBRA (por defecto): sports.auto_resolve = false → la propuesta queda
// 'pending' y nada se resuelve ni se anula solo. Con auto_resolve = true (y la
// predicción con auto_resolve), resuelve con resolve_porra_system.
//
// INTERRUPTOR: el cron solo trabaja con content_engine.enabled y sin
// kill_switch (los crons de 0081 ya lo comprueban; esto es la segunda llave).
// Sin API_FOOTBALL_KEY, registra el error en agent_runs y no hace nada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type Decision, type Fixture,
  decidir, esClasico, estadoDe, ganadorReglamentario, opcionDe, plantillaMatchWinner, tocaComprobar,
} from "./deportes.ts";

const API = "https://v3.football.api-sports.io";
const H = 3600_000;
const iso = (t: number) => new Date(t).toISOString();

type Competicion = {
  name: string; league: number; season: number; market: string;
  importance?: number; only_teams_of_league?: number; enabled?: boolean;
};
type Sports = {
  auto_resolve?: boolean; daily_call_cap?: number; result_delay_min?: number; calendar_every_h?: number;
  competitions?: Competicion[]; clasicos?: string[][];
};
type Motor = { enabled?: boolean; kill_switch?: boolean; sources?: Record<string, boolean>; sports?: Sports };

// Cliente de API-Football con tope de llamadas por pasada (lo que queda del día).
class Proveedor {
  llamadas = 0;
  constructor(private key: string, private tope: number) {}
  async get<T>(path: string, params: Record<string, string | number>): Promise<T[]> {
    if (this.llamadas >= this.tope) throw new Error("tope_diario_de_llamadas");
    this.llamadas++;
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    const res = await fetch(`${API}/${path}?${qs}`, { headers: { "x-apisports-key": this.key } });
    const j = await res.json().catch(() => ({}));
    // errors llega como [] si todo va bien, o como objeto con el motivo.
    const e = j?.errors;
    const hayError = Array.isArray(e) ? e.length > 0 : !!e && Object.keys(e).length > 0;
    if (!res.ok || hayError) throw new Error(`api-football ${res.status} ${JSON.stringify(e ?? {}).slice(0, 160)}`);
    return Array.isArray(j?.response) ? j.response as T[] : [];
  }
}

// Día (YYYY-MM-DD) en una zona, para los parámetros from/to.
function diaEn(t: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}

// ───────────────────────────── calendario ───────────────────────────────────
// deno-lint-ignore no-explicit-any
async function calendario(admin: any, prov: Proveedor, sp: Sports, ahora: number, errores: string[]) {
  const out = { partidos: 0, eventos: 0, propuestas: 0 };
  const equiposDe = new Map<number, Set<number>>();
  for (const c of (sp.competitions ?? []).filter((c) => c.enabled !== false)) {
    try {
      const tz = c.market === "CO" ? "America/Bogota" : "UTC";
      let fx = await prov.get<Fixture>("fixtures", {
        league: c.league, season: c.season, from: diaEn(ahora, tz), to: diaEn(ahora + 7 * 24 * H, tz), timezone: tz,
      });
      // Copas internacionales: solo los partidos de clubes de la liga indicada.
      if (c.only_teams_of_league) {
        let ids = equiposDe.get(c.only_teams_of_league);
        if (!ids) {
          const eq = await prov.get<{ team: { id: number } }>("teams", { league: c.only_teams_of_league, season: c.season });
          ids = new Set(eq.map((x) => x.team.id));
          equiposDe.set(c.only_teams_of_league, ids);
        }
        fx = fx.filter((f) => ids!.has(f.teams.home.id ?? -1) || ids!.has(f.teams.away.id ?? -1));
      }
      out.partidos += fx.length;
      if (!fx.length) continue;
      const filas = fx.map((f) => ({
        market: c.market, kind: "match", provider: "api_football", external_id: String(f.fixture.id),
        competition: c.name, title: `${f.teams.home.name} vs ${f.teams.away.name}`,
        home: f.teams.home.name, away: f.teams.away.name,
        starts_at: iso(Date.parse(f.fixture.date)), status: estadoDe(f.fixture.status.short),
        importance: esClasico(f.teams.home.name, f.teams.away.name, sp.clasicos) ? 3 : (c.importance ?? 1),
      }));
      const { error } = await admin.from("content_events").upsert(filas, { onConflict: "provider,external_id" });
      if (error) errores.push(`eventos ${c.name}: ${String(error.message).slice(0, 160)}`);
      else out.eventos += filas.length;
    } catch (e) {
      errores.push(`calendario ${c.name}: ${String(e).slice(0, 160)}`);
    }
  }

  // Plantilla Nivel A de los partidos que empiezan entre 3 h y 48 h.
  const { data: evs } = await admin.from("content_events")
    .select("id, market, home, away, starts_at, competition, external_id, importance")
    .eq("provider", "api_football").eq("kind", "match").eq("status", "scheduled")
    .gte("starts_at", iso(ahora + 3 * H)).lte("starts_at", iso(ahora + 48 * H)).limit(200);
  const lista = (evs ?? []) as { id: string; market: string; home: string; away: string; starts_at: string; competition: string | null; external_id: string; importance: number }[];
  if (!lista.length) return out;
  const { data: hechas } = await admin.from("topic_proposals").select("event_id")
    .eq("template_key", "match_winner").in("event_id", lista.map((e) => e.id));
  const ya = new Set(((hechas ?? []) as { event_id: string }[]).map((p) => p.event_id));
  for (const ev of lista.filter((e) => !ya.has(e.id))) {
    const t = plantillaMatchWinner(ev);
    const { error } = await admin.from("topic_proposals").insert({
      ...t, market: ev.market, event_id: ev.id, template_key: "match_winner",
      resolution_kind: "calendar", autonomy: "A", status: "scheduled", scheduled_for: iso(ahora),
      kind: "porra", lang: "es", flags: ev.importance >= 3 ? ["clasico"] : [],
    });
    if (!error) out.propuestas++;
    else if (error.code !== "23505") errores.push(`plantilla ${ev.external_id}: ${String(error.message).slice(0, 160)}`);
  }
  return out;
}

// ───────────────────────────── resultados ───────────────────────────────────
type Ev = { id: string; external_id: string; home: string; away: string; starts_at: string; status: string; finished_at: string | null; last_checked_at: string | null; result: Record<string, unknown> | null };
type Porra = { id: string; title: string; status: string; template_key: string | null; auto_resolve: boolean; resolved_at: string | null; winning_option_id: string | null };

// deno-lint-ignore no-explicit-any
async function aplicar(admin: any, ev: Ev, d: Decision, f: Fixture, sp: Sports, ahora: number, out: Record<string, number>, errores: string[]): Promise<boolean> {
  const { data: ps } = await admin.from("porras")
    .select("id, title, status, template_key, auto_resolve, resolved_at, winning_option_id").eq("event_id", ev.id);
  const porras = (ps ?? []) as Porra[];
  const auto = sp.auto_resolve === true;
  const fuente = [{ url: `${API}/fixtures?id=${f.fixture.id}`, dominio: "api-football.com", titulo: `API-Football · ${ev.home} vs ${ev.away}` }];
  let cerrado = false;

  if (d.accion === "ampliar") {
    const nuevoFin = iso(Date.parse(d.nuevoInicio) + 2 * H + 15 * 60_000);
    await admin.from("porras").update({ resolves_at: nuevoFin }).eq("event_id", ev.id).eq("status", "open");
    await admin.from("content_events").update({ starts_at: d.nuevoInicio }).eq("id", ev.id);
    out.ampliadas++;
    return false;
  }
  if (d.accion !== "resolver" && d.accion !== "anular") return false;

  for (const p of porras) {
    if (p.status === "open") {
      // Una sola propuesta por predicción: la pendiente espera a una persona.
      const { data: previa } = await admin.from("resolution_proposals").select("id, status")
        .eq("porra_id", p.id).in("status", ["pending", "approved", "applied"]).limit(1).maybeSingle();
      if (previa && previa.status !== "approved") continue;
      let proposalId: string | null = previa?.id ?? null;
      let opcion: string | null = null;
      if (d.accion === "resolver") {
        const idx = opcionDe(p.template_key, d.ganador);
        if (idx == null) continue;
        const { data: o } = await admin.from("porra_options").select("id").eq("porra_id", p.id).eq("idx", idx).maybeSingle();
        if (!o) { errores.push(`sin opción ${idx} en ${p.id}`); continue; }
        opcion = o.id;
      }
      if (!proposalId) {
        const { data: nueva, error } = await admin.from("resolution_proposals").insert({
          porra_id: p.id, kind: "provider", proposed_option_id: opcion, proposes_void: d.accion === "anular",
          confidence: 1, sources: fuente, status: auto ? "approved" : "pending",
          reason: d.accion === "resolver"
            ? `${ev.home} ${d.home}-${d.away} ${ev.away} al final del tiempo reglamentario (${f.fixture.status.short}).`
            : `Partido ${d.motivo} según el proveedor (${f.fixture.status.short}).`,
        }).select("id").single();
        if (error) { errores.push(`propuesta ${p.id}: ${String(error.message).slice(0, 160)}`); continue; }
        proposalId = nueva.id;
      }
      if (!(auto && p.auto_resolve)) { out.pendientes++; continue; }
      const { data: hecho, error } = d.accion === "resolver"
        ? await admin.rpc("resolve_porra_system", { p_porra: p.id, p_winning: opcion, p_proposal: proposalId })
        : await admin.rpc("void_porra_system", { p_porra: p.id, p_reason: `partido ${d.motivo}`, p_proposal: proposalId });
      if (error) errores.push(`${d.accion} ${p.id}: ${String(error.message).slice(0, 160)}`);
      else if (hecho) out[d.accion === "resolver" ? "resueltas" : "anuladas"]++;
    } else if (d.accion === "resolver" && p.status === "resolved" && p.resolved_at
               && ahora - Date.parse(p.resolved_at) <= 2 * H) {
      // El proveedor corrige en las 2 h siguientes: aviso, nunca re-resuelve.
      const idx = opcionDe(p.template_key, d.ganador);
      const { data: o } = idx == null ? { data: null } :
        await admin.from("porra_options").select("id").eq("porra_id", p.id).eq("idx", idx).maybeSingle();
      if (o && o.id !== p.winning_option_id) {
        await admin.rpc("motor_avisar_admins", {
          p_titulo: `Resultado corregido por el proveedor: ${p.title}`.slice(0, 120),
          p_cuerpo: `API-Football ahora da ${ev.home} ${d.home}-${d.away} ${ev.away}. La predicción ya está resuelta: revísala.`,
          p_url: "/admin/porras",
        });
        out.correcciones++;
      }
    }
  }
  if (d.accion === "anular" && d.avisar) {
    await admin.rpc("motor_avisar_admins", {
      p_titulo: `Partido resuelto en los despachos: ${ev.home} vs ${ev.away}`.slice(0, 120),
      p_cuerpo: `El proveedor marca ${f.fixture.status.short}. Las predicciones del partido se anulan con devolución.`,
      p_url: "/admin/porras",
    });
  }
  // Se deja de mirar: anulado ya, o 2 h después del final (fin de la ventana de correcciones).
  if (d.accion === "anular") cerrado = true;
  if (d.accion === "resolver" && ev.finished_at && ahora - Date.parse(ev.finished_at) > 2 * H) cerrado = true;
  return cerrado;
}

// deno-lint-ignore no-explicit-any
async function resultados(admin: any, prov: Proveedor, sp: Sports, ahora: number, errores: string[]) {
  const out: Record<string, number> = { mirados: 0, resueltas: 0, anuladas: 0, pendientes: 0, ampliadas: 0, correcciones: 0 };
  const { data } = await admin.from("content_events")
    .select("id, external_id, home, away, starts_at, status, finished_at, last_checked_at, result")
    .eq("provider", "api_football")
    .gte("starts_at", iso(ahora - 30 * H)).lte("starts_at", iso(ahora + 10 * 60_000)).limit(200);
  const evs = ((data ?? []) as Ev[]).filter((e) => e.result?.cerrado !== true && tocaComprobar(e.starts_at, e.last_checked_at, ahora));
  for (let i = 0; i < evs.length; i += 20) {
    const lote = evs.slice(i, i + 20);
    let fx: Fixture[] = [];
    try { fx = await prov.get<Fixture>("fixtures", { ids: lote.map((e) => e.external_id).join("-") }); }
    catch (e) { errores.push(`resultados: ${String(e).slice(0, 160)}`); break; }
    const porId = new Map(fx.map((f) => [String(f.fixture.id), f]));
    for (const ev of lote) {
      const f = porId.get(ev.external_id);
      if (!f) continue;
      out.mirados++;
      const estado = estadoDe(f.fixture.status.short);
      const finVisto = ev.finished_at ?? (estado === "finished" ? iso(ahora) : null);
      const d = decidir(f, { inicio: ev.starts_at, finVisto: ev.finished_at, ahora, esperaMin: sp.result_delay_min });
      const g = ganadorReglamentario(f);
      let cerrado = false;
      try { cerrado = await aplicar(admin, ev, d, f, sp, ahora, out, errores); }
      catch (e) { errores.push(`aplicar ${ev.external_id}: ${String(e).slice(0, 160)}`); }
      await admin.from("content_events").update({
        status: estado, last_checked_at: iso(ahora), finished_at: finVisto,
        result: { ...(ev.result ?? {}), ...(g ? { home_goals: g.home, away_goals: g.away, winner: g.ganador } : {}),
                  period: f.fixture.status.short, ...(cerrado ? { cerrado: true } : {}) },
      }).eq("id", ev.id);
    }
  }
  return out;
}

// ─────────────────────────────── servidor ───────────────────────────────────
Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const t0 = Date.now();
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "results" ? "results" : "calendar";

  const secret = Deno.env.get("CRON_SECRET") ?? "";
  const isCron = !!secret && req.headers.get("x-cron-secret") === secret;
  if (!isCron) {
    const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await userClient.auth.getUser();
    const { data: prof } = user ? await admin.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
    if (prof?.role !== "admin") return json({ error: "forbidden" }, 403);
  }

  const { data: cfg } = await admin.from("remote_config").select("value").eq("key", "content_engine").maybeSingle();
  const motor = (cfg?.value ?? {}) as Motor;
  const sp = motor.sports ?? {};
  if (isCron && (motor.enabled !== true || motor.kill_switch === true || motor.sources?.calendar === false)) {
    return json({ mode, skipped: true, motivo: motor.kill_switch ? "kill_switch" : "motor_apagado" });
  }
  const ahora = Date.now();

  // El calendario, como mucho cada calendar_every_h horas (salvo body.force de un admin).
  if (mode === "calendar" && !(body.force === true && !isCron)) {
    const { data: ult } = await admin.from("agent_runs").select("created_at").eq("kind", "calendar")
      .gt("created_at", iso(ahora - Number(sp.calendar_every_h ?? 6) * H)).limit(1);
    if (ult && ult.length) return json({ mode, skipped: true, motivo: "calendario_reciente" });
  }

  const { data: run } = await admin.from("agent_runs").insert({ kind: mode }).select("id").single();
  const errores: string[] = [];
  const key = Deno.env.get("API_FOOTBALL_KEY") ?? "";
  let counts: Record<string, unknown> = {};
  let llamadas = 0;
  if (!key) {
    errores.push("sin API_FOOTBALL_KEY: no se llama al proveedor");
  } else {
    // Tope diario de llamadas (el plan se reinicia a las 00:00 UTC).
    const d = new Date(ahora);
    const { data: hoy } = await admin.from("agent_runs").select("counts").in("kind", ["calendar", "results"])
      .gte("created_at", iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))).limit(2000);
    const usadas = ((hoy ?? []) as { counts: { llamadas?: number } | null }[]).reduce((a, r) => a + Number(r.counts?.llamadas ?? 0), 0);
    const prov = new Proveedor(key, Math.max(0, Number(sp.daily_call_cap ?? 90) - usadas));
    counts = mode === "calendar"
      ? await calendario(admin, prov, sp, ahora, errores)
      : await resultados(admin, prov, sp, ahora, errores);
    llamadas = prov.llamadas;
  }
  if (run?.id) {
    await admin.from("agent_runs").update({
      counts: { ...counts, llamadas, modo_sombra: sp.auto_resolve !== true },
      errors: errores.slice(0, 20), duration_ms: Date.now() - t0, finished_at: iso(Date.now()),
    }).eq("id", run.id);
  }
  return json({ mode, ...counts, llamadas, errores });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type",
    },
  });
}
