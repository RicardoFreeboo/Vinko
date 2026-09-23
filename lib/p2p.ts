// P2P sin custodia: helpers de cliente. Vinko NUNCA está en medio del pago —
// solo construimos un enlace/instrucción para que una persona pague a otra
// directamente (PayPal.me con importe, o Bizum al teléfono). No hay pasarela,
// no hay cobro de Vinko, no hay comisión del reparto.

export function money(minor: number, currency = "EUR"): string {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: currency || "EUR" }).format((minor || 0) / 100);
  } catch {
    return `${((minor || 0) / 100).toFixed(2)} ${currency}`;
  }
}

export type PayTarget = {
  kind: "paypal" | "bizum" | "other" | "none";
  href?: string;   // enlace directo si lo hay (PayPal.me)
  display: string; // qué mostrar (teléfono, @usuario, texto)
  copy: string;    // texto para copiar al portapapeles
};

// Deriva a quién y cómo pagar a partir del handle guardado por el que cobra.
// Ejemplos de handle: "paypal.me/ricardo", "paypal:ricardo", "+34600111222",
// "bizum:+34600111222", "@ricardo" (otro método). amountMinor en céntimos.
export function payTarget(handle: string | null | undefined, amountMinor: number, currency = "EUR"): PayTarget {
  const raw = (handle ?? "").trim();
  const amount = ((amountMinor || 0) / 100).toFixed(2);
  const cur = (currency || "EUR").toUpperCase();
  if (!raw) return { kind: "none", display: "", copy: "" };

  const low = raw.toLowerCase();
  // PayPal.me: admite importe y divisa en la URL.
  const pp = low.match(/(?:paypal\.me\/|paypal:)\s*([a-z0-9._-]+)/i) || (low.startsWith("paypal") ? low.match(/([a-z0-9._-]+)\s*$/i) : null);
  if (pp && pp[1]) {
    const user = pp[1].replace(/[^a-z0-9._-]/gi, "");
    return {
      kind: "paypal",
      href: `https://www.paypal.com/paypalme/${user}/${amount}${cur}`,
      display: `paypal.me/${user}`,
      copy: `paypal.me/${user} · ${money(amountMinor, cur)}`,
    };
  }

  // Bizum: teléfono. No hay enlace web universal; se paga desde la app del banco.
  const phone = raw.replace(/(?:bizum:|tel:)/i, "").trim();
  if (/^\+?\d[\d\s]{6,}$/.test(phone)) {
    const clean = phone.replace(/\s+/g, "");
    return { kind: "bizum", display: clean, copy: `Bizum ${clean} · ${money(amountMinor, cur)}` };
  }

  return { kind: "other", display: raw, copy: `${raw} · ${money(amountMinor, cur)}` };
}
