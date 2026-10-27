import { t } from "@/lib/i18n";

// Fechas cortas del inicio (VINKO_PANTALLAS 04), en la zona que se pase (en el
// servidor, la del perfil: TzSync la mantiene igual a la del dispositivo):
//   whenLabel → «Hoy 7:00 p. m.» · «Mañana 9:00 a. m.» · «Dom 9:00 p. m.» · «12 nov»
//   leftLabel → «2 d 14 h» · «5 h 20 min» · «12 min»   (lo que falta hasta una fecha)
//   clockLeft → «2:14» (horas:minutos hasta una fecha; null si ya pasó)

function ymd(d: Date, tz?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function whenLabel(iso: string, tz?: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = new Intl.DateTimeFormat("es-CO", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
  const days = Math.round((Date.parse(ymd(d, tz)) - Date.parse(ymd(now, tz))) / 86400000);
  if (days === 0) return t("when.today", { time });
  if (days === 1) return t("when.tomorrow", { time });
  if (days > 1 && days < 7) {
    const wd = new Intl.DateTimeFormat("es-CO", { timeZone: tz, weekday: "short" }).format(d).replace(/\.$/, "");
    return `${cap(wd)} ${time}`;
  }
  return new Intl.DateTimeFormat("es-CO", { timeZone: tz, day: "numeric", month: "short" }).format(d)
    .replace(/\./g, "").replace(/\sde\s/, " "); // «12 de nov.» → «12 nov»
}

export function leftLabel(iso: string, now: Date = new Date()): string {
  const ms = new Date(iso).getTime() - now.getTime();
  if (!(ms > 0)) return t("when.now");
  const min = Math.floor(ms / 60000);
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (d > 0) return t("when.dh", { d: String(d), h: String(h) });
  if (h > 0) return t("when.hm", { h: String(h), m: String(m) });
  return t("when.m", { m: String(Math.max(1, m)) });
}

export function clockLeft(iso: string, now: Date = new Date()): string | null {
  const ms = new Date(iso).getTime() - now.getTime();
  if (!(ms > 0)) return null;
  const min = Math.floor(ms / 60000);
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}
