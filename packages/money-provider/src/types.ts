// Tipos del proveedor de dinero (M0, docs/money/CONTRATOS_M0.md §B1).
// Principio: el núcleo de Vinko guarda REFERENCIAS (ids externos, estados,
// configuración de la bolsa). Ningún tipo de aquí transporta saldos de usuario.

export type MoneyMode = "points_only" | "affiliate_only" | "partner" | "own";

export type KycStatus = "none" | "pending" | "verified" | "rejected" | "expired";

export type EligibilityReason =
  | "anonymous"
  | "kill_switch"
  | "country_disabled"
  | "country_undeclared"
  | "geo_unknown"
  | "geo_mismatch"
  | "underage"
  | "kyc_required"
  | "kyc_pending"
  | "self_excluded"
  | "limit_reached"
  | "cooling_off"
  | "provider_unavailable";

export interface Eligibility {
  eligible: boolean;
  reasons: EligibilityReason[];
  kycStatus: KycStatus;
  country: string | null;
  limits?: { stakeMaxMinor: number; poolsPerDayMax: number; currency: string };
}

export interface CreatePoolInput {
  porraId: string;
  country: string;
  currency: string;
  stakeMinor: number;
  rakeBps: number;
  closesAt: string;
  optionsCount: number;
  maxParticipants?: number;
  resolutionSourceRef: string;
  createdByUserId: string;
}

export type PoolStatus = "open" | "closed" | "settled" | "voided";

export type MoneyWebhookType =
  | "participation.confirmed"
  | "participation.failed"
  | "participation.refunded"
  | "participation.paid"
  | "pool.closed"
  | "pool.settled"
  | "pool.voided"
  | "kyc.updated"
  | "account.suspended";

// Lista cerrada: la Edge Function money-webhook rechaza (400) cualquier otro tipo.
export const MONEY_WEBHOOK_TYPES: readonly MoneyWebhookType[] = [
  "participation.confirmed",
  "participation.failed",
  "participation.refunded",
  "participation.paid",
  "pool.closed",
  "pool.settled",
  "pool.voided",
  "kyc.updated",
  "account.suspended",
];

export interface MoneyWebhookPayload {
  external_pool_id?: string;
  participation_ref?: string;
  reason?: string;
  participants?: number;
  winners_n?: number;
  user_id?: string;
  country?: string;
  kyc_status?: KycStatus;
}

export interface MoneyWebhookEvent {
  event_id: string;
  type: MoneyWebhookType;
  provider: string;
  payload: MoneyWebhookPayload;
}

export interface MoneyProvider {
  readonly id: "mock" | `partner_${string}` | "vinko_money";
  eligibility(userId: string, country: string): Promise<Eligibility>;
  startKyc(userId: string, country: string, returnUrl: string): Promise<{ url: string }>;
  createPool(input: CreatePoolInput): Promise<{ externalPoolId: string }>;
  join(input: {
    externalPoolId: string;
    userId: string;
    optionIdx: number;
    returnUrl: string;
  }): Promise<{ cashierUrl: string; participationRef: string }>;
  settle(input: {
    externalPoolId: string;
    winningOptionIdx: number | null;
    resultSourceRef: string;
  }): Promise<{ accepted: boolean }>;
  voidPool(input: { externalPoolId: string; reason: string }): Promise<{ accepted: boolean }>;
  getPoolStatus(externalPoolId: string): Promise<{ status: PoolStatus; participants: number }>;
}
