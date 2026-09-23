// Errores tipados de dinero (diseño frontend §7.4/§7.5). Los RPC lanzan códigos
// VK_* (o los VINKO_* existentes); aquí se traducen a una clave i18n + acción, y
// se marca si el dinero se movió. La UI NUNCA muestra el mensaje crudo de Postgres.
// Módulo puro (usable en cliente): sin imports de servidor.

export type VkCode =
  | "VK_INSUFFICIENT_FUNDS"
  | "VK_INSUFFICIENT_COINS"
  | "VK_PORRA_CLOSED"
  | "VK_LIMIT_DAILY"
  | "VK_LIMIT_WEEKLY"
  | "VK_LIMIT_MONTHLY"
  | "VK_KYC_REQUIRED"
  | "VK_SELF_EXCLUDED"
  | "VK_UNDERAGE"
  | "VK_REGION_UNAVAILABLE"
  | "VK_IDEMPOTENCY_MISMATCH"
  | "VK_ALREADY_ENTERED"
  | "NETWORK"
  | "UNKNOWN";

// moved: ¿se ha movido el dinero del usuario? La primera frase del copy debe responderlo.
export type VkError = { code: VkCode; messageKey: string; actionKey: string | null; moved: "no" | "unknown" };
export type VkResult<T> = { ok: true; data: T } | { ok: false; error: VkError };

// Códigos con acción sugerida (se traduce con money.act.<code>).
const WITH_ACTION: ReadonlySet<VkCode> = new Set<VkCode>([
  "VK_INSUFFICIENT_FUNDS", "VK_INSUFFICIENT_COINS", "VK_PORRA_CLOSED", "VK_LIMIT_DAILY",
  "VK_LIMIT_WEEKLY", "VK_LIMIT_MONTHLY", "VK_KYC_REQUIRED", "VK_SELF_EXCLUDED",
  "VK_REGION_UNAVAILABLE", "VK_IDEMPOTENCY_MISMATCH", "VK_ALREADY_ENTERED", "UNKNOWN",
]);

// Solo estos dejan el estado del dinero incierto; el resto es "no se ha movido nada".
const MOVED_UNKNOWN: ReadonlySet<VkCode> = new Set<VkCode>(["NETWORK", "UNKNOWN"]);

// Mapa de códigos VINKO_* existentes (M0 y P2P) al catálogo VK_ del frontend.
const LEGACY: Record<string, VkCode> = {
  VINKO_MONEY_UNDERAGE: "VK_UNDERAGE",
  VINKO_P2P_UNDERAGE: "VK_UNDERAGE",
  VINKO_MONEY_CLOSED: "VK_PORRA_CLOSED",
  VINKO_MONEY_POOL_NOT_OPEN: "VK_PORRA_CLOSED",
  VINKO_P2P_CLOSED: "VK_PORRA_CLOSED",
  VINKO_MONEY_LIMIT: "VK_LIMIT_DAILY",
  VINKO_MONEY_ALREADY_IN: "VK_ALREADY_ENTERED",
  VINKO_MONEY_COUNTRY_OFF: "VK_REGION_UNAVAILABLE",
  VINKO_MONEY_KILL_SWITCH: "VK_REGION_UNAVAILABLE",
  VINKO_MONEY_GEO_MISMATCH: "VK_REGION_UNAVAILABLE",
  VINKO_MONEY_USER_NOT_ALLOWED: "VK_KYC_REQUIRED",
};

const KNOWN_VK = new Set<string>([
  "VK_INSUFFICIENT_FUNDS", "VK_INSUFFICIENT_COINS", "VK_PORRA_CLOSED", "VK_LIMIT_DAILY",
  "VK_LIMIT_WEEKLY", "VK_LIMIT_MONTHLY", "VK_KYC_REQUIRED", "VK_SELF_EXCLUDED", "VK_UNDERAGE",
  "VK_REGION_UNAVAILABLE", "VK_IDEMPOTENCY_MISMATCH", "VK_ALREADY_ENTERED", "NETWORK",
]);

/** Extrae el VkCode de un texto de error (mensaje de Postgres/Supabase o Error de red). */
export function codeFrom(raw: string | null | undefined): VkCode {
  const s = String(raw ?? "");
  const vk = s.match(/VK_[A-Z_]+/);
  if (vk && KNOWN_VK.has(vk[0])) return vk[0] as VkCode;
  const legacy = s.match(/VINKO_[A-Z0-9_]+/);
  if (legacy && LEGACY[legacy[0]]) return LEGACY[legacy[0]];
  if (/network|fetch|timeout|abort|failed to fetch/i.test(s)) return "NETWORK";
  return "UNKNOWN";
}

export function toVkError(error: unknown): VkError {
  const raw =
    typeof error === "string" ? error
    : error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message)
    : "";
  const code = codeFrom(raw);
  return {
    code,
    messageKey: `money.err.${code}`,
    actionKey: WITH_ACTION.has(code) ? `money.act.${code}` : null,
    moved: MOVED_UNKNOWN.has(code) ? "unknown" : "no",
  };
}
