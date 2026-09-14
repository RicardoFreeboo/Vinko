// Puerta de acceso por código diario (rotación cada 24 h, hora de Madrid).
// Estático = validación en cliente: candado SUAVE para enseñar a inversores,
// no seguridad real (el código se deriva en el navegador). La versión robusta
// (código firmado en servidor) llega con Node — ver docs/conexiones-pendientes.md.

const SALT = "vinko-alfa-2026"; // rota este valor para invalidar todos los códigos

// djb2 → 6 dígitos deterministas por día.
export function dailyCode(day: string): string {
  const s = `${day}|${SALT}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return String(h % 1_000_000).padStart(6, "0");
}

// Día y segundos hasta medianoche en Europe/Madrid (sin depender del reloj UTC).
export function madridClock(now: Date = new Date()): { day: string; secsToMidnight: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  let hh = parseInt(get("hour"), 10);
  if (hh === 24) hh = 0; // algunos entornos devuelven 24 a medianoche
  const secs = hh * 3600 + parseInt(get("minute"), 10) * 60 + parseInt(get("second"), 10);
  return { day, secsToMidnight: 24 * 3600 - secs };
}
