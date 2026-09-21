// Regla legal (spec §1.2 y §4.1): la Puntería (marcador_total) es un concurso
// puro de habilidad. Ningún RPC de anuncios, tienda o recompensas puede
// escribirla. Se comprueba sobre la ÚLTIMA definición de cada función en las
// migraciones (create or replace gana la más reciente).
import fs from "node:fs";
import path from "node:path";
import { test, assert } from "./_harness.mjs";

const dir = path.resolve("supabase/migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const bodies = new Map();
const re = /create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?(?:\$\$|\$function\$)([\s\S]*?)(?:\$\$|\$function\$)/gi;
for (const f of files) {
  const sql = fs.readFileSync(path.join(dir, f), "utf8");
  for (const m of sql.matchAll(re)) bodies.set(m[1], { file: f, body: m[3] });
}

const PROHIBIDAS = /^(grant_ad_reward|claim_ad_reward|rewards?_claim|buy_item|change_pick|claim_drip|claim_daily_bonus|grant_share_reward|claim_referral|pay_referral|approve_user_video|make_guest_pick|convert_guest)/;
const tocan = [...bodies.entries()].filter(([name]) => PROHIBIDAS.test(name));

test("hay funciones de anuncios/tienda/recompensas que auditar", () => {
  assert(tocan.length >= 5, `solo ${tocan.length} funciones encontradas`);
});

for (const [name, { file, body }] of tocan) {
  test(`${name} (${file}) no toca la Puntería`, () => {
    assert(!/marcador_total/i.test(body), `${name} escribe marcador_total`);
    assert(!/award_score\s*\(/i.test(body), `${name} llama a award_score`);
    assert(!/pick_scores/i.test(body), `${name} toca pick_scores`);
  });
}

test("solo resolve_* y award_score escriben marcador_total", () => {
  const escriben = [...bodies.entries()]
    .filter(([, v]) => /update\s+(public\.)?profiles[\s\S]{0,200}marcador_total\s*=/i.test(v.body))
    .map(([n]) => n);
  const permitidas = escriben.filter((n) => !/^(award_score|resolve_|admin_|cron_|league_|season_)/.test(n));
  assert(permitidas.length === 0, `escriben marcador_total fuera de lo permitido: ${permitidas.join(", ")}`);
});
