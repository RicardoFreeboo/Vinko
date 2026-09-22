// La modalidad de dinero (MoneyCta + copy money.*) va en un chunk aparte
// (dynamic ssr:false vía MoneyMount): NUNCA en los chunks eager de las páginas
// públicas. Estático sobre el build: si no hay build, SKIP.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, assert, ROOT } from "./_harness.mjs";

const MANIFEST = join(ROOT, ".next/app-build-manifest.json");
// Páginas que jamás deben arrastrar la modalidad de dinero en su carga inicial.
const PAGES = ["/p/[slug]/page", "/feed/page", "/hoy/page", "/nueva/page"];
const NEEDLES = ["MoneyCta", "money.cta"];

await test("money-bundle: cero rastro de dinero en los chunks eager de páginas públicas", () => {
  if (!existsSync(MANIFEST)) {
    console.log("  SKIP  money-bundle: sin .next/app-build-manifest.json (corre tras `next build`)");
    return;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const pages = manifest.pages ?? {};
  const bad = [];
  for (const page of PAGES) {
    const key = Object.keys(pages).find((k) => k === page || k.endsWith(page));
    if (!key) continue; // esa página puede no existir en este build
    for (const rel of pages[key]) {
      const file = join(ROOT, ".next", rel);
      if (!existsSync(file)) continue;
      const code = readFileSync(file, "utf8");
      for (const n of NEEDLES) if (code.includes(n)) bad.push(`${key} → ${rel}: «${n}»`);
    }
  }
  assert.deepEqual(bad, [], `chunks eager con rastro de dinero:\n  ${bad.join("\n  ")}`);
});
