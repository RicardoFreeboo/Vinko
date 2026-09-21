// Despliega una Edge Function de Supabase SIN la CLI (Node 18+, cero deps).
//
// Uso:
//   SUPABASE_ACCESS_TOKEN=sbp_xxx SUPABASE_PROJECT_REF=uarnpxjdccbidgzhhavc \
//     node scripts/deploy-edge.mjs trend-generate
//   node scripts/deploy-edge.mjs trend-generate --verify-jwt   (si la función
//     debe exigir JWT; por defecto verify_jwt=false: trend-generate valida por
//     sí misma el secreto del cron o la sesión admin)
//
// Qué hace: POST https://api.supabase.com/v1/projects/$REF/functions/deploy?slug=<slug>
// como multipart/form-data con una parte "metadata"
// ({"entrypoint_path":"index.ts","verify_jwt":false,"name":"<slug>"}) y una
// parte "file" por cada .ts/.json de supabase/functions/<slug>/ (index.ts y sus
// módulos hermanos, p.ej. filtros.ts). Las variables (ANTHROPIC_API_KEY,
// CRON_SECRET…) NO se tocan: viven en los secretos del proyecto.
//
// El token es un Personal Access Token de https://supabase.com/dashboard/account/tokens
// (no la service role). El ref es el subdominio del proyecto.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"));
const verifyJwt = args.includes("--verify-jwt");
// También --token-file <ruta> y --ref <ref> (para entornos donde no se puede
// exportar una variable de entorno en la misma línea).
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const token = process.env.SUPABASE_ACCESS_TOKEN
  ?? (flag("--token-file") ? (await import("node:fs")).readFileSync(flag("--token-file"), "utf8").trim() : undefined);
const ref = process.env.SUPABASE_PROJECT_REF ?? flag("--ref");

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }
if (!slug || !/^[a-z0-9-]{2,60}$/.test(slug)) fail("uso: node scripts/deploy-edge.mjs <slug> [--verify-jwt]");
if (!token) fail("falta SUPABASE_ACCESS_TOKEN (token personal de supabase.com/dashboard/account/tokens)");
if (!ref) fail("falta SUPABASE_PROJECT_REF (ref del proyecto, p.ej. uarnpxjdccbidgzhhavc)");

const dir = join(root, "supabase", "functions", slug);
let entries;
try { entries = readdirSync(dir); } catch { fail(`no existe ${dir}`); }
const files = entries
  .filter((f) => /\.(ts|js|json)$/.test(f) && statSync(join(dir, f)).isFile())
  .sort((a, b) => (a === "index.ts" ? -1 : b === "index.ts" ? 1 : a.localeCompare(b)));
if (!files.includes("index.ts")) fail(`${dir} no tiene index.ts`);

const form = new FormData();
form.append("metadata", JSON.stringify({ entrypoint_path: "index.ts", verify_jwt: verifyJwt, name: slug }));
for (const f of files) {
  const body = readFileSync(join(dir, f));
  form.append("file", new Blob([body], { type: f.endsWith(".json") ? "application/json" : "application/typescript" }), f);
}

const url = `https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${encodeURIComponent(slug)}`;
console.log(`→ ${slug}: ${files.join(", ")} → ${url}`);
const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
const text = await res.text();
let out = text;
try { const j = JSON.parse(text); out = JSON.stringify({ id: j.id, slug: j.slug, version: j.version, status: j.status, verify_jwt: j.verify_jwt }); } catch { /* texto plano */ }
if (!res.ok) fail(`HTTP ${res.status}: ${text.slice(0, 600)}`);
console.log(`✓ desplegada ${out}`);
