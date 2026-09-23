// VINKO_BILLING_SPEC Parte C: el Club (Stripe/PayPal) JAMÁS cobra un importe
// derivado de una porra. Falla si el código de cobro del Club menciona
// money_pools / money_participations / rake / bote, o si su importe no sale de
// la config del Club. Verificación estática, sin red.
import { test, assert } from "./_harness.mjs";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./_harness.mjs";

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|mjs)$/.test(p)) out.push(p);
  }
  return out;
}

const CLUB_FILES = [
  ...walk(join(ROOT, "app/api/club")),
  join(ROOT, "supabase/functions/billing-webhook/index.ts"),
  join(ROOT, "lib/club.ts"),
  join(ROOT, "components/ClubCard.tsx"),
].filter(existsSync);

const BANNED = /money_pools|money_participations|\brake\b|stake_minor|winning_option/;

test("club: los archivos de cobro no referencian porras de dinero", () => {
  assert.ok(CLUB_FILES.length >= 3, "faltan archivos del Club que auditar");
  for (const f of CLUB_FILES) {
    const src = readFileSync(f, "utf8");
    assert.ok(!BANNED.test(src), `${f} referencia el bote de una porra; el Club no puede depender de money_pools`);
  }
});

test("club: el importe del checkout sale de la config del Club, no de una porra", () => {
  const f = join(ROOT, "app/api/club/checkout/route.ts");
  const src = readFileSync(f, "utf8");
  assert.match(src, /getClubConfig/, "el importe debe venir de getClubConfig (remote_config.club)");
  assert.match(src, /unit_amount/, "debe fijar unit_amount de la cuota, no un % de bote");
});

test("club_apply_event no toca points/xp/marcador (SQL 0046)", () => {
  const f = join(ROOT, "supabase/migrations/0046_club.sql");
  const src = readFileSync(f, "utf8");
  const fn = src.slice(src.indexOf("function public.club_apply_event"));
  const body = fn.slice(0, fn.indexOf("$$;") + 3);
  assert.ok(!/\bpoints\b|\bxp\b|marcador_total/.test(body), "club_apply_event no debe tocar la economía de puntos");
});
