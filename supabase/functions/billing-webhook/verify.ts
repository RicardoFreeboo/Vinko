// Verificación de la firma de webhooks de Stripe (cabecera Stripe-Signature:
// "t=<unix>,v1=<hex>"). HMAC-SHA256 de `${t}.${rawBody}` con el signing secret
// (whsec_...). Mismo esquema que packages/money-provider/src/signing.ts; copia
// aquí porque el desplegador solo sube esta carpeta. Solo Web Crypto (Deno).

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  const n = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  let out = ""; const b = new Uint8Array(sig);
  for (let i = 0; i < b.length; i++) out += b[i].toString(16).padStart(2, "0");
  return out;
}

export type VerifyResult = { ok: true } | { ok: false; reason: "missing" | "malformed" | "stale" | "mismatch" };
const TOLERANCE_S = 300;

// Stripe permite varios v1 (rotación de secretos): acepta si alguno coincide.
export async function verifyStripe(secret: string, header: string | null, rawBody: string, nowS?: number): Promise<VerifyResult> {
  if (!header || header.trim() === "") return { ok: false, reason: "missing" };
  let tRaw: string | null = null; const v1s: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("="); if (eq < 0) continue;
    const k = part.slice(0, eq).trim(), v = part.slice(eq + 1).trim();
    if (k === "t" && tRaw === null) tRaw = v;
    else if (k === "v1" && /^[0-9a-fA-F]+$/.test(v) && v.length % 2 === 0) v1s.push(v);
  }
  if (tRaw === null || !/^\d{1,12}$/.test(tRaw) || v1s.length === 0) return { ok: false, reason: "malformed" };
  const t = Number(tRaw), now = nowS ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > TOLERANCE_S) return { ok: false, reason: "stale" };
  const expected = hexToBytes(await hmacHex(secret, `${t}.${rawBody}`));
  for (const v of v1s) if (timingSafeEqualBytes(hexToBytes(v.toLowerCase()), expected)) return { ok: true };
  return { ok: false, reason: "mismatch" };
}
