#!/usr/bin/env node
// Smoke E2E contra un despliegue REAL (por defecto producción; solo lectura,
// nunca entra en la puerta de código diario ni escribe nada).
//   node tests/e2e/smoke.mjs                       → https://www.vinko.fun
//   BASE_URL=https://deploy-preview-x.netlify.app node tests/e2e/smoke.mjs
// Sin runner: node + playwright. Nació de dos regresiones del feed en una
// semana (feed vacío por recursión RLS; 0 vídeos porque el LIMIT de SQL corría
// antes del orden vídeo-primero). Cada check imprime PASS/FAIL/SKIP y el
// proceso sale con 1 si falla alguno.
//
// Variables: BASE_URL · PW_CHANNEL (msedge|chrome|chromium; en local msedge,
// en CI el chromium de Playwright) · SMOKE_NO_BROWSER=1 (solo checks HTTP).

import { performance } from "node:perf_hooks";

const BASE = (process.env.BASE_URL || "https://www.vinko.fun").replace(/\/+$/, "");
const NO_BROWSER = process.env.SMOKE_NO_BROWSER === "1" || process.argv.includes("--no-browser");

// Porra centinela: editorial fija con vídeo local (lib/editorial.ts).
const CANARY = {
  slug: "clasico-liga",
  title: "Clásico de Liga",
  options: ["Real Madrid", "Barça", "Empate"],
};
const PUBLIC_PAGES = ["/", `/p/${CANARY.slug}`, "/privacidad", "/terminos", "/login"];
// Etiquetas de la portada temática (messages/es.json · cover.*).
const COVER_LABELS = ["Realities", "Fútbol", "Motor", "Tenis", "Streamers", "Música", "Tele y cine", "El tiempo", "Economía", "Actualidad"];
// Lista negra de copy público (CLAUDE.md). Palabra completa (admite plural), sin distinguir mayúsculas.
const BLACKLIST = ["apuesta", "apostar", "cuota", "casino", "betting", "wallet", "dinero real", "recargar", "comprar puntos"];
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 VinkoSmoke/1";

const out = { pass: 0, fail: 0, skip: 0, failures: [] };
const log = (tag, name, info) => console.log(`${tag.padEnd(5)} ${name}${info ? ` — ${info}` : ""}`);
const fail = (msg) => { throw new Error(msg); };

async function check(name, fn) {
  try {
    const r = await fn();
    if (r && typeof r === "object" && r.skip) { out.skip++; log("SKIP", name, r.skip); }
    else { out.pass++; log("PASS", name, typeof r === "string" ? r : ""); }
  } catch (e) {
    out.fail++;
    out.failures.push(name);
    log("FAIL", name, String(e?.message ?? e).split("\n")[0]);
  }
}

async function get(path, headers = {}) {
  const t0 = performance.now();
  const res = await fetch(BASE + path, {
    headers: { "user-agent": UA, "accept-language": "es", ...headers },
    redirect: "manual",
  });
  const ttfb = Math.round(performance.now() - t0); // cabeceras recibidas
  const body = await res.text();
  return { status: res.status, body, ttfb, bytes: Buffer.byteLength(body), location: res.headers.get("location") };
}

// Texto "visible" aproximado: sin scripts/estilos/etiquetas, más el contenido de
// las <meta> (og:description, description) que también es copy pública.
function textOf(html) {
  const metas = [...html.matchAll(/<meta\b[^>]*\bcontent="([^"]*)"/gi)].map((m) => m[1]).join(" ");
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return `${body} ${metas}`
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim();
}

// Palabra completa con límites Unicode: el \b de JS es ASCII y no separa
// "apuesta" de "apuestas" ni "cuota" de "cuotas".
const wordRx = (w) => new RegExp(`(?<![\\p{L}\\p{N}_])${w.replace(/ /g, "\\s+")}s?(?![\\p{L}\\p{N}_])`, "iu");
function lexiconHits(text) {
  const hits = [];
  for (const w of BLACKLIST) {
    const m = text.match(wordRx(w));
    if (m) hits.push(m[0]);
  }
  return hits;
}

// Payload RSC del feed: {slug, video} de cada porra, en orden y sin duplicados.
// Las porras van como JSON dentro del payload: "slug":"…", …, "video":null|"url".
function parseFeed(payload) {
  const items = [];
  const seen = new Set();
  const re = /"slug":"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(payload))) {
    const slug = JSON.parse(`"${m[1]}"`);
    const rest = payload.slice(m.index + m[0].length);
    const next = rest.search(/"slug":"/);
    const scope = next < 0 ? rest : rest.slice(0, next);
    const v = scope.match(/"video":(null|"(?:[^"\\]|\\.)*")/);
    if (!v || seen.has(slug)) continue;
    seen.add(slug);
    items.push({ slug, video: v[1] === "null" ? null : JSON.parse(v[1]) });
  }
  return items;
}

async function launchBrowser() {
  const { chromium } = await import("playwright");
  const channel = process.env.PW_CHANNEL ?? (process.env.CI ? undefined : "msedge");
  try {
    return { browser: await chromium.launch({ channel, headless: true }), channel: channel ?? "chromium" };
  } catch (e) {
    if (!channel) throw e;
    console.log(`      (canal ${channel} no disponible: ${String(e.message).split("\n")[0]} → chromium de Playwright)`);
    return { browser: await chromium.launch({ headless: true }), channel: "chromium" };
  }
}

console.log(`Smoke Vinko → ${BASE}`);
const pages = {}; // caché de HTML por ruta (para el léxico)
let feed = [];

// a) Landing --------------------------------------------------------------
await check("a) GET / responde 200 con la marca y enlaces a /login, /privacidad y /terminos", async () => {
  const r = await get("/");
  pages["/"] = r;
  if (r.status !== 200) fail(`status ${r.status}${r.location ? ` → ${r.location}` : ""}`);
  if (!/vinko/i.test(r.body)) fail("no aparece la marca «vinko»");
  for (const href of ["/login", "/privacidad", "/terminos"]) {
    if (!new RegExp(`href="${href}(?:[?#][^"]*)?"`).test(r.body)) fail(`falta el enlace a ${href}`);
  }
  return `${r.bytes} B, TTFB ${r.ttfb} ms`;
});

// b) Feed (payload RSC) ---------------------------------------------------
await check("b) Feed (payload RSC): ≥ 5 porras, ≥ 3 con vídeo y las 5 primeras con vídeo", async () => {
  const r = await get("/feed", { RSC: "1" });
  if (r.status !== 200) fail(`status ${r.status}${r.location ? ` → ${r.location}` : ""}`);
  feed = parseFeed(r.body);
  const withVideo = feed.filter((p) => p.video);
  const first5 = feed.slice(0, 5);
  const info = `${feed.length} porras, ${withVideo.length} con vídeo, primeras 5 con vídeo: ${first5.filter((p) => p.video).length}/5`;
  if (feed.length < 5) fail(`solo ${feed.length} porras (¿feed vacío / RLS rota?) · ${info}`);
  if (withVideo.length < 3) fail(`solo ${withVideo.length} con vídeo (¿LIMIT antes del orden vídeo-primero?) · ${info}`);
  if (first5.some((p) => !p.video)) {
    fail(`el orden no es vídeo-primero: ${first5.map((p) => `${p.slug}${p.video ? "" : " (sin vídeo)"}`).join(", ")}`);
  }
  return info;
});

// c) /p/<centinela>: HTML del servidor -------------------------------------
await check(`c) /p/${CANARY.slug} HTML sin JS: <video autoplay poster>, título, opciones y cero AdSense`, async () => {
  const r = await get(`/p/${CANARY.slug}`);
  pages[`/p/${CANARY.slug}`] = r;
  if (r.status !== 200) fail(`status ${r.status}`);
  const video = r.body.match(/<video\b[^>]*>/i)?.[0];
  if (!video) fail("no hay <video> en el HTML del servidor");
  if (!/\sautoplay(?:=|\s|>)/i.test(video)) fail(`<video> sin autoplay: ${video}`);
  if (!/\sposter="[^"]+"/i.test(video)) fail(`<video> sin poster: ${video}`);
  if (!r.body.includes(CANARY.title)) fail(`no aparece el título «${CANARY.title}»`);
  const opts = CANARY.options.filter((o) => r.body.includes(o));
  if (opts.length < 2) fail(`solo ${opts.length} opción(es) de ${CANARY.options.join(" / ")}`);
  if (/adsbygoogle/i.test(r.body)) fail("aparece «adsbygoogle»: hay script de ads en /p (freeze: cero ads en /p/[slug])");
  return `video+autoplay+poster OK, ${opts.length}/${CANARY.options.length} opciones, sin ads`;
});

// c) /p/<centinela>: navegador móvil --------------------------------------
await check(`c) /p/${CANARY.slug} en móvil 390×844: el vídeo carga (readyState ≥ 2) y reproduce en < 8 s`, async () => {
  if (NO_BROWSER) return { skip: "sin navegador (SMOKE_NO_BROWSER=1)" };
  const { browser, channel } = await launchBrowser();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: UA, locale: "es-ES",
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/p/${CANARY.slug}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    if ((await page.locator("video").count()) === 0) {
      const cover = page.getByText(new RegExp(COVER_LABELS.join("|"), "i")).first();
      if (!(await cover.isVisible().catch(() => false))) fail("ni <video> ni portada temática visible");
      return `sin vídeo, portada visible (${channel})`;
    }
    const ok = await page
      .waitForFunction(() => { const v = document.querySelector("video"); return !!v && v.readyState >= 2 && !v.paused; }, null, { timeout: 8_000 })
      .then(() => true, () => false);
    const st = await page.evaluate(() => {
      const v = document.querySelector("video");
      return { readyState: v.readyState, paused: v.paused, t: +v.currentTime.toFixed(2), w: v.videoWidth, h: v.videoHeight, error: v.error?.code ?? null, src: v.currentSrc };
    });
    if (!ok) fail(`el vídeo no reproduce en 8 s: ${JSON.stringify(st)} (${channel})`);
    return `readyState ${st.readyState}, ${st.w}×${st.h}, t=${st.t}s (${channel})`;
  } finally {
    await browser.close();
  }
});

// d) Porra SIN vídeo → portada temática ------------------------------------
await check("d) /p de una porra SIN vídeo pinta la portada temática (etiqueta del tema)", async () => {
  const cands = feed.filter((p) => !p.video).slice(0, 3);
  if (!cands.length) return { skip: feed.length ? "el feed no tiene ninguna porra sin vídeo" : "sin feed (falló el check b)" };
  const tried = [];
  for (const c of cands) {
    const r = await get(`/p/${c.slug}`);
    tried.push(`${c.slug} → ${r.status}`);
    if (r.status !== 200) continue;
    pages[`/p/${c.slug}`] = r;
    if (/<video\b/i.test(r.body)) fail(`${c.slug}: el feed dice video:null pero /p trae <video>`);
    const label = COVER_LABELS.find((l) => r.body.includes(l));
    if (!label) fail(`${c.slug}: sin etiqueta de portada (${COVER_LABELS.join(" / ")})`);
    return `${c.slug}: portada «${label}»`;
  }
  fail(`ninguna candidata respondió 200: ${tried.join("; ")}`);
});

// e) Léxico -----------------------------------------------------------------
await check("e) Léxico: ninguna página pública contiene la lista negra", async () => {
  for (const path of PUBLIC_PAGES) if (!pages[path]) pages[path] = await get(path);
  const bad = [];
  for (const [path, r] of Object.entries(pages)) {
    const hits = lexiconHits(textOf(r.body));
    if (hits.length) bad.push(`${path}: «${hits.join("», «")}»`);
  }
  if (bad.length) fail(bad.join(" · "));
  return `${Object.keys(pages).length} páginas limpias (${Object.keys(pages).join(", ")})`;
});

// f) Legales ----------------------------------------------------------------
for (const path of ["/privacidad", "/terminos"]) {
  await check(`f) ${path} responde 200 con texto suficiente (> 2000 caracteres)`, async () => {
    const r = pages[path] ?? (pages[path] = await get(path));
    if (r.status !== 200) fail(`status ${r.status}`);
    const n = textOf(r.body).length;
    if (n <= 2000) fail(`solo ${n} caracteres de texto`);
    return `${n} caracteres`;
  });
}

// g) Rendimiento ------------------------------------------------------------
await check(`g) Rendimiento /p/${CANARY.slug}: TTFB < 1500 ms y HTML < 200 KB`, async () => {
  const r = await get(`/p/${CANARY.slug}`);
  const kb = (r.bytes / 1024).toFixed(1);
  const info = `TTFB ${r.ttfb} ms, HTML ${kb} KB`;
  if (r.ttfb >= 1500) fail(`TTFB ${r.ttfb} ms ≥ 1500 ms · ${info}`);
  if (r.bytes >= 200 * 1024) fail(`HTML ${kb} KB ≥ 200 KB · ${info}`);
  return info;
});

// h) Cero dinero en público ------------------------------------------------
await check("h) Cero dinero en público: ninguna página pública muestra la modalidad de dinero", async () => {
  const MONEY_RX = /jugar con dinero|money-cta|MoneyCta|verificar identidad|bolsa de dinero/i;
  const paths = ["/", "/feed", `/p/${CANARY.slug}`, "/hoy", "/nueva", "/login"];
  const bad = [];
  for (const path of paths) {
    const r = pages[path]?.body ? pages[path] : (pages[path] = await get(path));
    const m = r.body.match(MONEY_RX);
    if (m) bad.push(`${path}: «${m[0]}»`);
  }
  if (bad.length) fail(bad.join(" · "));
  return `${paths.length} páginas sin rastro de dinero`;
});

console.log(`\n${out.pass} PASS · ${out.fail} FAIL · ${out.skip} SKIP · ${BASE}`);
if (out.fail) {
  console.log(`Fallan: ${out.failures.join(" | ")}`);
  process.exit(1);
}
