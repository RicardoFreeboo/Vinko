import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3200";
const OUT = process.env.OUT ?? "shots-admin";
mkdirSync(OUT, { recursive: true });
const pages = [
  ["hub", "/admin"], ["metricas", "/admin/metricas"], ["moderacion", "/admin/moderacion"],
  ["temas", "/admin/temas"], ["health", "/admin/health"], ["live", "/admin/live"],
];
const b = await chromium.launch({ channel: "msedge", headless: true });
// desktop full-page
const d = await b.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
for (const [n, p] of pages) { await d.goto(BASE + p, { waitUntil: "networkidle" }); await d.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); console.log("desktop", n); }
// móvil
const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
for (const [n, p] of [["hub-m","/admin"],["metricas-m","/admin/metricas"]]) { await m.goto(BASE + p, { waitUntil: "networkidle" }); await m.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); console.log("mobile", n); }
await b.close();
console.log("OK");
