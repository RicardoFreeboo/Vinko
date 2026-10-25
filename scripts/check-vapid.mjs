#!/usr/bin/env node
// Valida que el par VAPID del entorno CASA (C2): deriva la clave pública a partir
// de la privada (P-256) y la compara con NEXT_PUBLIC_VAPID_PUBLIC_KEY. Si no casan,
// el navegador se suscribe pero el push se rechaza EN SILENCIO; aquí se detecta y
// se FALLA (exit 1) en vez de descubrirlo en producción sin un push entregado.
//
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY=B... VAPID_PRIVATE_KEY=... node scripts/check-vapid.mjs
//
// Sin las dos claves en el entorno: AVISA y sale 0 (como schema-invariant sin
// base), para no romper CI/predeploy donde no hay secretos. Dependencia cero.
import crypto from "node:crypto";

function b64urlToBuf(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from((s + pad).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

const pub = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();
const priv = (process.env.VAPID_PRIVATE_KEY ?? "").trim();

if (!pub || !priv) {
  console.log("• VAPID · AVISO: faltan NEXT_PUBLIC_VAPID_PUBLIC_KEY y/o VAPID_PRIVATE_KEY. Paso omitido (valídalo al sembrar secretos).");
  process.exit(0);
}

let provided, privBuf;
try {
  provided = b64urlToBuf(pub);
  privBuf = b64urlToBuf(priv);
} catch {
  console.error("✗ VAPID: alguna clave no es base64url válido.");
  process.exit(1);
}
if (provided.length !== 65 || provided[0] !== 0x04) {
  console.error(`✗ VAPID: la pública debe ser un punto sin comprimir de 65 bytes (0x04…); tiene ${provided.length} bytes.`);
  process.exit(1);
}
if (privBuf.length !== 32) {
  console.error(`✗ VAPID: la privada debe ser el escalar de 32 bytes; tiene ${privBuf.length} bytes.`);
  process.exit(1);
}

let derived;
try {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.setPrivateKey(privBuf);
  derived = ecdh.getPublicKey(); // punto sin comprimir, 65 bytes
} catch (e) {
  console.error(`✗ VAPID: no se pudo derivar la pública desde la privada (${e?.message ?? e}).`);
  process.exit(1);
}

if (Buffer.compare(derived, provided) !== 0) {
  console.error("✗ VAPID: la clave pública NO corresponde a la privada. El push se rechazaría en silencio.");
  console.error(`  pública derivada de la privada: ${derived.toString("base64url")}`);
  console.error("  Regenera el par o alinea NEXT_PUBLIC_VAPID_PUBLIC_KEY con VAPID_PRIVATE_KEY.");
  process.exit(1);
}

console.log("✓ VAPID: la clave pública casa con la privada (par válido).");
process.exit(0);
