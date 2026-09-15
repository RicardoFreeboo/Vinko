// Edge Function: POST /push-dispatch — vacía la cola push_queue enviando
// web push (VAPID) a las suscripciones vivas de cada usuario. La invoca
// pg_cron (pg_net) cada 5 min con el secreto x-cron-secret; los topes de
// frecuencia YA se aplicaron en base de datos (try_reserve_push) antes de
// encolar — aquí solo se entrega.
// iOS: el payload siempre produce showNotification en el SW (nunca push
// silencioso, o Safari revoca la suscripción).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return json({ error: "forbidden" }, 403);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const vapidPub = Deno.env.get("VAPID_PUBLIC_KEY")!;
  const vapidPriv = Deno.env.get("VAPID_PRIVATE_KEY")!;
  webpush.setVapidDetails("mailto:hello@freebooadvertising.com", vapidPub, vapidPriv);

  const admin = createClient(url, service);
  const { data: queue, error } = await admin
    .from("push_queue").select("*").eq("status", "queued")
    .order("created_at").limit(100);
  if (error) return json({ error: error.message }, 500);

  let sent = 0, failed = 0, dropped = 0;
  for (const item of queue ?? []) {
    const { data: subs } = await admin
      .from("push_subscriptions").select("*")
      .eq("user_id", item.user_id).is("revoked_at", null);
    if (!subs?.length) {
      await admin.from("push_queue").update({ status: "dropped", sent_at: new Date().toISOString() }).eq("id", item.id);
      dropped++;
      continue;
    }
    const payload = JSON.stringify({
      title: item.title, body: item.body ?? "", url: item.url ?? "/", class: item.class,
    });
    let ok = false;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload, { TTL: 3600 },
        );
        ok = true;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode ?? 0;
        if (code === 404 || code === 410) {
          await admin.from("push_subscriptions")
            .update({ revoked_at: new Date().toISOString() }).eq("id", s.id);
        }
      }
    }
    await admin.from("push_queue")
      .update({ status: ok ? "sent" : "failed", sent_at: new Date().toISOString() })
      .eq("id", item.id);
    ok ? sent++ : failed++;
  }
  return json({ sent, failed, dropped });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  });
}
