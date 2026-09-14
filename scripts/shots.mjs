// Capturas Playwright 390×844 de PASO 2 + verificación de og:title / og:image.
// Usa el canal msedge (Edge del sistema): sin descargar navegadores.
// Uso: BASE=http://localhost:3100 node scripts/shots.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.env.OUT ?? "shots";
const SLUGS = ["clasico-octubre", "lluvia-boda-marta", "quien-paga-canas"];

mkdirSync(OUT, { recursive: true });

// 1) HTML SSR: og:title y og:image presentes sin ejecutar JS
let okMeta = true;
for (const slug of SLUGS) {
  const res = await fetch(`${BASE}/p/${slug}`);
  const html = await res.text();
  const hasTitle = /property="og:title"/.test(html);
  const hasImage = /property="og:image"/.test(html);
  const h1 = /<h1[^>]*>/.test(html);
  console.log(
    `${slug}: http ${res.status} · og:title ${hasTitle ? "OK" : "FALTA"} · og:image ${hasImage ? "OK" : "FALTA"} · h1 sin JS ${h1 ? "OK" : "FALTA"}`,
  );
  okMeta &&= res.ok && hasTitle && hasImage && h1;
}

// 2) La imagen OG responde y es png
for (const slug of SLUGS.slice(0, 2)) {
  const res = await fetch(`${BASE}/p/${slug}/opengraph-image`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(
    `og-image ${slug}: http ${res.status} · ${res.headers.get("content-type")} · ${(buf.length / 1024).toFixed(0)} KB`,
  );
  okMeta &&= res.ok && (res.headers.get("content-type") ?? "").includes("png");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(`${OUT}/og-${slug}.png`, buf);
}

// 3) Capturas móviles 390×844
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
for (const path of [`/p/${SLUGS[0]}`, `/p/${SLUGS[1]}`, `/`]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const name = path === "/" ? "home-lock" : path.split("/").pop();
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`captura: ${OUT}/${name}.png`);
}
await browser.close();

console.log(okMeta ? "TODO OK" : "FALLOS — revisar arriba");
process.exit(okMeta ? 0 : 1);
