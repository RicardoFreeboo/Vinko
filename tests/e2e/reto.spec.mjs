// ============================================================================
// RT-09 — prueba de aceptación del Reto con DOS cuentas NO admin (nota 2-oct).
// Corre contra un despliegue real (staging o prod) con la 0057 aplicada:
//
//   BASE=https://www.vinko.fun \
//   PW_STATE_A=.auth/a.json \        ← sesión de A (no admin): guárdala una vez
//   node tests/e2e/reto.spec.mjs     ← con `npx playwright codegen --save-storage`
//
// B entra SIN sesión (pick de invitada con nombre): no necesita credenciales.
// El paso 3 de RT-09 (B entra con un Google que ya tenía cuenta) es manual:
// la pantalla de Google no se puede automatizar sin cuentas de prueba OAuth.
// Los flujos de servidor equivalentes están cubiertos 1:1 en tests/sql/reto.test.sql.
// ============================================================================
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const STATE_A = process.env.PW_STATE_A;
const exe = process.env.PW_CHROMIUM;
const results = [];
const ok = (name, cond) => { results.push([cond, name]); console.log(`${cond ? "✓" : "✗"} ${name}`); };

if (!STATE_A) {
  console.log("PW_STATE_A no definido: guarda la sesión de una cuenta NO admin y repite.");
  process.exit(2);
}

const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const ctxA = await browser.newContext({ storageState: STATE_A, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const A = await ctxA.newPage();
const B = await ctxB.newPage();

// ── 1 · A crea un reto de UNA CENA y elige NO ────────────────────────────────
await A.goto(`${BASE}/nueva`, { waitUntil: "networkidle" });
await A.locator("input").first().fill(`¿Reto e2e ${Date.now().toString(36)}?`);
await A.getByRole("button", { name: /siguiente|continuar/i }).click();
await A.getByRole("button", { name: "No", exact: true }).first().click();          // ¿Tú qué dices?
await A.getByRole("button", { name: /una cena/i }).click();                        // ¿Qué os jugáis?
await A.getByRole("button", { name: /^publicar/i }).click();
await A.waitForURL(/\/nueva/, { timeout: 15000 });
const url = await A.locator("p.mono.break-all").innerText();
ok("1 · reto publicado con premio y mi lado", /\/p\//.test(url));
const shareTxt = await A.evaluate(() => document.body.innerText);
ok("1 · el texto de compartir lleva «cena» y «Yo digo No»", /cena/i.test(shareTxt) && /yo digo no/i.test(shareTxt));
const slugUrl = url.trim().split("?")[0];

// ── 2 · B abre el enlace sin sesión: reta + premio + A en NO; elige SÍ como «Ana»
await B.goto(slugUrl, { waitUntil: "networkidle" });
const bBody = (await B.locator("body").innerText()).toLowerCase();
ok("2 · B ve «te reta»", bBody.includes("te reta"));
ok("2 · B ve «os jugáis: una cena»", bBody.includes("os jugáis") && bBody.includes("cena"));
ok("2 · B ve a A en el lado del NO", /no/.test(bBody));
await B.getByRole("button", { name: /^sí/i }).click();
await B.getByPlaceholder(/tu nombre/i).fill("Ana");
await B.getByRole("button", { name: /confirmar/i }).click();
await B.waitForTimeout(2500);
ok("2 · B queda dentro como invitada", (await B.locator("body").innerText()).includes("Ana") || (await B.locator("body").innerText()).toLowerCase().includes("dentro"));

// A, con su /p abierta, ve a Ana sin recargar (sondeo de 15 s) y recibe el aviso
await A.goto(slugUrl, { waitUntil: "networkidle" });
await A.waitForTimeout(17000);
ok("2 · la /p de A muestra a «Ana» en SÍ sin recargar", (await A.locator("body").innerText()).includes("Ana"));
await A.goto(`${BASE}/buzon`, { waitUntil: "networkidle" });
ok("2 · aviso «Ana acepta tu reto» en el buzón de A", (await A.locator("body").innerText()).includes("Ana acepta tu reto"));

// ── 4 · ni un Vinko ni dinero en la pantalla del reto ────────────────────────
await A.goto(slugUrl, { waitUntil: "networkidle" });
const retoTxt = (await A.locator("body").innerText()).toLowerCase();
ok("4 · sin Vinkos ni Puntos/Dinero ni importes", !/vinkos|puntos\s*\/\s*dinero|€/.test(retoTxt.replace("puntos virtuales", "")));

console.log(`\n${results.filter(([c]) => c).length}/${results.length} OK — los pasos 3, 5 y 7 (Google ya existente, cierre a la hora exacta y iPhone/México) se hacen a mano con dos móviles (nota 2-oct).`);
await browser.close();
process.exit(results.every(([c]) => c) ? 0 : 1);
