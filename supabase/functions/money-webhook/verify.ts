// Verificación de la firma de los avisos (webhooks) del proveedor de dinero.
// COPIA EN TypeScript puro de packages/money-provider/src/signing.ts (verifySignature
// + hmacHex): el desplegador solo sube esta carpeta, así que no se importa desde
// packages/. Solo Web Crypto (globalThis.crypto.subtle) + TextEncoder → idéntico en
// Node 20+ y en Deno. Cualquier cambio aquí debe reflejarse allí y viceversa.

const enc = new TextEncoder();

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Comparación byte a byte en tiempo constante: recorre la longitud mayor y
// acumula diferencias con OR, sin salir antes de tiempo.
function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  const n = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** HMAC-SHA256 en hex minúsculas. */
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(message));
  let out = "";
  const bytes = new Uint8Array(sig);
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

export type VerifyResult = { ok: true } | { ok: false; reason: "missing" | "malformed" | "stale" | "mismatch" };

export const SIG_TOLERANCE_S = 300;

/**
 * Verifica la cabecera x-money-signature ("t=<unix s>,v1=<hex>") contra el
 * cuerpo CRUDO. missing → sin cabecera; malformed → sin t numérico o v1 hex;
 * stale → |now − t| > tolerancia; mismatch → firma incorrecta.
 */
export async function verifySignature(
  secret: string,
  header: string | null,
  rawBody: string,
  nowS?: number,
  toleranceS?: number,
): Promise<VerifyResult> {
  if (header == null || header.trim() === "") return { ok: false, reason: "missing" };

  let tRaw: string | null = null;
  let v1: string | null = null;
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === "t" && tRaw === null) tRaw = v;
    else if (k === "v1" && v1 === null) v1 = v;
  }
  if (tRaw === null || v1 === null || !/^\d{1,12}$/.test(tRaw)) return { ok: false, reason: "malformed" };
  if (v1.length === 0 || v1.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(v1)) return { ok: false, reason: "malformed" };

  const t = Number(tRaw);
  const now = nowS ?? Math.floor(Date.now() / 1000);
  const tol = toleranceS ?? SIG_TOLERANCE_S;
  if (Math.abs(now - t) > tol) return { ok: false, reason: "stale" };

  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  const ok = timingSafeEqualBytes(hexToBytes(v1.toLowerCase()), hexToBytes(expected));
  return ok ? { ok: true } : { ok: false, reason: "mismatch" };
}
