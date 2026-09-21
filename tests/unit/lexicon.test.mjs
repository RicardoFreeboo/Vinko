// scripts/lexicon-check.mjs — reglas del escáner de léxico prohibido: que
// pille copy real y que NO pille identificadores ni patrones de búsqueda.
import { test, assert } from "./_harness.mjs";
import { bannedIn, jsonHits, sqlLineHits, watchedMigrations, MIG_FROM } from "../../scripts/lexicon-check.mjs";

await test("bannedIn: pilla la lista negra y respeta la lista blanca", () => {
  assert.equal(bannedIn("Haz tu apuesta ahora"), "apuesta");
  assert.equal(bannedIn("Ya no se puede apostar."), "apostar");
  assert.equal(bannedIn("Las cuotas suben"), "cuotas");
  assert.equal(bannedIn("Se te devuelven 10 Vinkos. No se compran ni se canjean por dinero."), null);
  assert.equal(bannedIn("Porra social con puntos virtuales · juez = creador"), null);
});

await test("jsonHits: clave y término de cada string prohibido (también en arrays y objetos anidados)", () => {
  const hits = jsonHits({
    "ok.a": "Tu porra ya está creada",
    "mal.b": "Haz tu apuesta",
    "mal.c": ["Uno", "Casa de apuestas"],
    "mal.d": { x: "Recarga tu wallet" },
  });
  assert.deepEqual(hits.map((h) => `${h.key}:${h.term}`), ["mal.b:apuesta", "mal.c:apuestas", "mal.d:wallet"]);
});

await test("sqlLineHits: copy real dentro de notify_user → incidencia", () => {
  const hits = sqlLineHits(`  perform notify_user(r.user_id, 'resolucion', 'Ya no se puede apostar.', '/p/' || v.slug);`);
  assert.deepEqual(hits, [{ text: "Ya no se puede apostar.", term: "apostar" }]);
});

await test("sqlLineHits: '' como escape y varias incidencias en la misma línea", () => {
  const hits = sqlLineHits(`select 'L''apuesta', 'sin nada', 'Bote acumulado';`);
  assert.deepEqual(hits.map((h) => h.term), ["apuesta", "Bote"]);
});

await test("sqlLineHits: identificadores/claves de flag NO cuentan ('cuotas' en un array de flags)", () => {
  assert.deepEqual(sqlLineHits(`and not (flags ?| array['lexico','cuotas','invalida'])`), []);
  assert.deepEqual(sqlLineHits(`where status = 'open' and kind = 'apuesta'`), []);
});

await test("sqlLineHits: patrones de búsqueda NO cuentan (like, ~*, replace del texto viejo)", () => {
  assert.deepEqual(sqlLineHits(`  where body like 'Ya no se puede apostar.%';`), []);
  assert.deepEqual(sqlLineHits(`  where body ILIKE '%casino%'`), []);
  assert.deepEqual(sqlLineHits(`  select p ~* '(apuesta|casino|cuota)'`), []);
  assert.deepEqual(sqlLineHits(`update public.notifications set body = replace(body, 'Ya no se puede apostar.', 'Cerrada.')`), []);
});

await test("sqlLineHits: el texto NUEVO de un replace sí se escanea", () => {
  const hits = sqlLineHits(`update notifications set body = replace(body, 'Cerrada.', 'Haz tu apuesta')`);
  assert.deepEqual(hits.map((h) => h.term), ["apuesta"]);
});

await test("sqlLineHits: comentarios SQL y lexicon:ignore", () => {
  assert.deepEqual(sqlLineHits(`select 1; -- aquí se habla de 'apuesta' para explicar`), []);
  assert.deepEqual(sqlLineHits(`select 'Haz tu apuesta'; -- lexicon:ignore`), []);
  assert.equal(sqlLineHits(`select 'Haz tu apuesta';`).length, 1);
});

await test(`watchedMigrations: solo ficheros NNNN_*.sql con NNNN ≥ ${String(MIG_FROM).padStart(4, "0")}, ordenados`, () => {
  const files = watchedMigrations();
  assert.ok(files.length >= 1, "debería vigilar al menos 0030");
  for (const f of files) assert.ok(parseInt(f.slice(0, 4), 10) >= MIG_FROM, f);
  assert.deepEqual(files, [...files].sort());
  assert.deepEqual(watchedMigrations("/ruta/que/no/existe"), []);
});
