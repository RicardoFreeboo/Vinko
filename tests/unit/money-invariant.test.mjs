// Invariante de esquema (VINKO_MONEY_SPEC §4 y §10.1, regla de oro 1): el núcleo
// guarda REFERENCIAS, nunca saldos de usuario. Ninguna tabla ligada a un usuario
// (columna user_id / created_by / profile_id, o la propia tabla profiles) puede
// tener una columna de dinero: balance, wallet, iban, pan, card_*, *cents*,
// *_minor, amount_*, *_amount, currency.
//
// Este test es ESTÁTICO (no toca la base de datos): recorre
// supabase/migrations/*.sql, reconstruye por tabla el conjunto de columnas
// (create table + alter … add column, la última definición gana) y falla si
// alguna tabla en alcance tiene una columna que case con el patrón, salvo la
// excepción documentada money_pools.stake_minor / money_pools.currency
// (configuración de la bolsa: entrada fija y divisa, no dinero de usuarios).
//
// El equivalente en vivo es el RPC money_schema_invariant() (0045 §10), que
// scripts/schema-invariant.mjs comprueba contra la base real en predeploy.
import fs from "node:fs";
import path from "node:path";
import { test, assert } from "./_harness.mjs";

const dir = path.resolve("supabase/migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

// Patrón EXACTO del RPC money_schema_invariant() (0045:557). `amount` a secas no
// entra (son Vinkos: ad_impressions/porra_payouts/video_rewards, documentados);
// tampoco `cost` (tienda). Sí: *_amount, amount_*, *_minor, *cents*, currency…
const MONEY_COL = /(balance|wallet|iban|^pan$|card_|cents|_minor$|^amount_|_amount$|currency)/i;
// Alcance como el RPC money_schema_invariant() (0045+0048): también from_user/to_user
// (aristas de liquidación P2P), para que un saldo colado ahí también salte.
const USER_COLS = new Set(["user_id", "created_by", "profile_id", "from_user", "to_user"]);
// Excepciones documentadas (config o registro de liquidación, NUNCA saldos):
//  · money_pools: configuración de la bolsa del operador licenciado (0045).
//  · p2p_pools / p2p_settlements: entrada fija y el importe de CADA pago P2P
//    (registro estilo Splitwise, no un saldo agregado) (0048).
const EXEMPT = new Map([
  ["money_pools", new Set(["stake_minor", "currency"])],
  ["p2p_pools", new Set(["stake_minor", "currency"])],
  ["p2p_settlements", new Set(["amount_minor", "currency"])],
  // Fase 2 (0050): cuenta en el proveedor (config) y espejo de ledger (apuntes
  // que confirma el proveedor), nunca saldos del núcleo.
  ["money_accounts", new Set(["currency"])],
  ["money_ledger_refs", new Set(["amount_minor", "currency"])],
]);
const CONSTRAINT_KW = /^(primary|unique|check|foreign|constraint|references|exclude|like|partition)\b/i;

// Quita comentarios (línea y bloque) y vacía el contenido de las cadenas
// ('...' y $tag$...$tag$) para que los paréntesis y comas de dentro no cuenten.
// Los nombres de columna nunca viven dentro de cadenas ni comentarios.
function stripNoise(sql) {
  let out = "";
  for (let i = 0, n = sql.length; i < n; ) {
    const c = sql[i], c2 = sql[i + 1];
    if (c === "-" && c2 === "-") { while (i < n && sql[i] !== "\n") i++; continue; }
    if (c === "/" && c2 === "*") { i += 2; while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i++; i += 2; continue; }
    if (c === "'") {
      out += "'"; i++;
      while (i < n) { if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; } if (sql[i] === "'") break; i++; }
      out += "'"; i++; continue;
    }
    if (c === "$") {
      const m = /^\$([a-zA-Z_][a-zA-Z0-9_]*|)\$/.exec(sql.slice(i));
      if (m) { const tag = m[0]; const end = sql.indexOf(tag, i + tag.length); i = end === -1 ? n : end + tag.length; out += " "; continue; }
    }
    out += c; i++;
  }
  return out;
}

// Extrae el contenido del paréntesis balanceado que empieza en openIdx ('(').
function balanced(text, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") { if (--depth === 0) return text.slice(openIdx + 1, i); }
  }
  return null;
}

// Parte el cuerpo de un create table por comas de nivel 0 (fuera de paréntesis).
function splitTop(body) {
  const parts = []; let depth = 0, cur = "";
  for (const ch of body) {
    if (ch === "(") { depth++; cur += ch; }
    else if (ch === ")") { depth--; cur += ch; }
    else if (ch === "," && depth === 0) { parts.push(cur); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

// tabla -> Set(columnas). Reconstruye desde create table y alter … add column.
const tables = new Map();
const addCol = (t, col) => { if (!tables.has(t)) tables.set(t, new Set()); tables.get(t).add(col.toLowerCase()); };

const CT = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi;
const AT = /alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?([\s\S]*?);/gi;
const ADD = /add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi;
const COLNAME = /^"?([a-z_][a-z0-9_]*)"?/i;

for (const f of files) {
  const sql = stripNoise(fs.readFileSync(path.join(dir, f), "utf8"));
  for (const m of sql.matchAll(CT)) {
    const table = m[1].toLowerCase();
    const openIdx = m.index + m[0].length - 1; // el '(' final del match
    const body = balanced(sql, openIdx);
    if (body == null) continue;
    for (const part of splitTop(body)) {
      const trimmed = part.trim();
      if (!trimmed || CONSTRAINT_KW.test(trimmed)) continue;
      const nm = COLNAME.exec(trimmed);
      if (nm) addCol(table, nm[1]);
    }
  }
  for (const m of sql.matchAll(AT)) {
    const table = m[1].toLowerCase();
    for (const a of m[2].matchAll(ADD)) addCol(table, a[1]);
  }
}

test("se reconstruyeron columnas de las tablas del núcleo", () => {
  assert(tables.size >= 20, `solo ${tables.size} tablas parseadas`);
  for (const t of ["profiles", "money_pools", "money_participations", "ad_impressions", "porra_payouts"])
    assert(tables.has(t), `no se parseó la tabla ${t}`);
});

// Alcance: tablas con user_id/created_by/profile_id, más profiles.
function inScope(table, cols) {
  if (table === "profiles") return true;
  for (const c of cols) if (USER_COLS.has(c)) return true;
  return false;
}

test("ninguna tabla ligada a usuario tiene columnas de saldo/dinero (§4, §10.1)", () => {
  const viol = [];
  for (const [table, cols] of tables) {
    if (!inScope(table, cols)) continue;
    const exempt = EXEMPT.get(table);
    for (const col of cols) {
      if (exempt && exempt.has(col)) continue;
      if (MONEY_COL.test(col)) viol.push(`${table}.${col}`);
    }
  }
  assert(viol.length === 0, `columnas de dinero ligadas a usuario: ${viol.join(", ")}`);
});

// Guarda: confirma que la excepción está viva (money_pools SÍ es tabla de usuario,
// tiene created_by, y sus columnas stake_minor/currency casarían sin la excepción).
test("money_pools.stake_minor/currency solo pasan por la excepción documentada", () => {
  const cols = tables.get("money_pools");
  assert(cols?.has("created_by"), "money_pools debería tener created_by (tabla de usuario)");
  assert(cols?.has("stake_minor") && MONEY_COL.test("stake_minor"), "stake_minor debería casar el patrón");
  assert(cols?.has("currency") && MONEY_COL.test("currency"), "currency debería casar el patrón");
});
