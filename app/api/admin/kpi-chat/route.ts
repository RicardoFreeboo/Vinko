import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Chat del panel de KPIs (/admin): Ricardo pregunta "¿cómo va todo?" y el
// modelo responde SOLO con los datos reales que se le pasan aquí (RPCs de
// métricas, estado de porras, agente, cron y avisos). Nunca inventa cifras: si
// algo no está en el contexto, lo dice. Requiere ANTHROPIC_API_KEY en Vercel.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.KPI_CHAT_MODEL ?? "claude-sonnet-5";

type Msg = { role: "user" | "assistant"; content: string };

async function contexto() {
  const sb = await supabaseServer();
  if (!sb) return { error: "sin backend" };
  // Cada bloque falla por separado: el chat funciona aunque una RPC no exista
  // todavía (las kpi_* llegan con la migración 0033).
  const rpc = async (fn: string, args: Record<string, unknown> = {}) => {
    try { const { data, error } = await sb.rpc(fn, args); return error ? { error: error.message } : data; }
    catch (e) { return { error: String(e) }; }
  };
  const now = new Date().toISOString();
  const [counts, retention, dau, funnel, kfactor, economy, live] = await Promise.all([
    rpc("kpi_counts"), rpc("kpi_retention"), rpc("kpi_dau_mau"), rpc("kpi_funnel"), rpc("kpi_kfactor"), rpc("kpi_economy"),
    rpc("admin_live_feed", { p_limit: 30 }),
  ]);
  const q = async <T,>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) => {
    const { data, error } = await p; return error ? { error: error.message } : data;
  };
  const [porras, cerradas, pendientes, propuestas, avisos, daily, perfiles] = await Promise.all([
    q(sb.from("porras").select("status, source, media_url", { count: "exact", head: false }).eq("is_template", false)),
    q(sb.from("porras").select("slug, title, closes_at").eq("status", "open").lt("closes_at", now).order("closes_at").limit(40)),
    q(sb.from("porras").select("slug, title, closes_at").eq("status", "open").gt("closes_at", now).order("closes_at").limit(15)),
    q(sb.from("topic_proposals").select("status", { count: "exact", head: false }).in("status", ["pending_review", "published", "rejected"])),
    q(sb.from("notifications").select("class, created_at").gt("created_at", new Date(Date.now() - 86400e3).toISOString())),
    q(sb.from("daily_picks").select("scheduled_for, status, question").order("scheduled_for", { ascending: false }).limit(12)),
    q(sb.from("profiles").select("created_at, referred_by, points, streak_days, role")),
  ]);
  const agg = (rows: unknown, key: string) => {
    if (!Array.isArray(rows)) return rows;
    const m: Record<string, number> = {};
    for (const r of rows as Record<string, string>[]) { const k = String(r[key]); m[k] = (m[k] ?? 0) + 1; }
    return m;
  };
  return {
    generado: now,
    conteos_admin: counts,
    porras: {
      por_estado: agg(porras, "status"), por_origen: agg(porras, "source"),
      con_video: Array.isArray(porras) ? (porras as { media_url: string | null }[]).filter((p) => p.media_url).length : null,
      cerradas_sin_resolver: cerradas, proximos_cierres: pendientes,
    },
    agente: { propuestas_por_estado: agg(propuestas, "status") },
    pique_del_dia: daily,
    perfiles: Array.isArray(perfiles) ? {
      total: perfiles.length,
      ultimos_7d: (perfiles as { created_at: string }[]).filter((p) => Date.now() - new Date(p.created_at).getTime() < 7 * 86400e3).length,
      con_referido: (perfiles as { referred_by: string | null }[]).filter((p) => p.referred_by).length,
      racha_7_o_mas: (perfiles as { streak_days: number }[]).filter((p) => (p.streak_days ?? 0) >= 7).length,
      admins: (perfiles as { role: string }[]).filter((p) => p.role === "admin").length,
    } : perfiles,
    avisos_24h_por_clase: agg(avisos, "class"),
    kpis: { retencion: retention, dau_mau: dau, embudo: funnel, k_factor: kfactor, economia: economy },
    actividad_reciente: live,
  };
}

const SISTEMA = `Eres el analista de producto de Vinko (www.vinko.fun), una porra social con puntos virtuales (Vinkos) que nunca se compran ni se canjean por dinero. Hablas con Ricardo, el fundador, en español, directo y sin relleno.
Reglas:
- Usa SOLO las cifras del CONTEXTO JSON. Si un dato no está, di "no lo tengo" y qué haría falta medir. Jamás inventes ni estimes cifras como si fueran reales.
- Cuando te pregunten "cómo va todo": 1) estado en 3 líneas, 2) fallos o riesgos que ves en los datos (porras cerradas sin resolver, pique del día sin resolver, propuestas del agente sin revisar, avisos anómalos, caída de actividad, buffer de piques corto), 3) tres recomendaciones concretas y priorizadas para hoy, cada una con el dato que la justifica.
- Sé honesto con las cohortes pequeñas: con menos de 5 usuarios por cohorte no hay retención medible.
- Vocabulario público: porra, pick, pronóstico, Vinkos, Puntería, juez. Nunca: apuesta, apostar, cuota, casino, dinero real.
- Responde en Markdown breve (listas cortas), sin cabeceras enormes.`;

export async function POST(req: Request) {
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ error: "sin backend" }, { status: 500 });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "no_auth" }, { status: 401 });
  const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "no_key" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { messages?: Msg[] };
  const messages = (body.messages ?? []).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-12);
  if (!messages.length) return NextResponse.json({ error: "empty" }, { status: 400 });

  const ctx = await contexto();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1200, stream: true,
      system: [{ type: "text", text: SISTEMA }, { type: "text", text: "CONTEXTO JSON:\n" + JSON.stringify(ctx).slice(0, 60000) }],
      messages,
    }),
  });
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => "");
    return NextResponse.json({ error: "upstream", detail: txt.slice(0, 300) }, { status: 502 });
  }
  // Se reenvía solo el texto (SSE de Anthropic → texto plano en streaming).
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) { controller.close(); return; }
      for (const line of dec.decode(value, { stream: true }).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const ev = JSON.parse(line.slice(6)) as { type: string; delta?: { type: string; text?: string } };
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
            controller.enqueue(new TextEncoder().encode(ev.delta.text));
          }
        } catch { /* línea parcial */ }
      }
    },
    cancel() { void reader.cancel(); },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
