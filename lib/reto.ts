// El Reto — fachada tipada de lib/reto-core.mjs (la lógica vive allí para que
// tests/unit/reto.test.mjs la importe con Node sin compilar TypeScript).
export {
  STAKE_MONEY_RX,
  STAKE_LEXICON_RX,
  STAKE_PRESETS,
  stakeTextError,
  objectionThreshold,
  stakeEmoji,
  esReto,
} from "./reto-core.mjs";

export type StakeError = "short" | "long" | "money" | "lexicon" | null;
export type StakePresetKey = "cena" | "cafe" | "ronda" | "otro" | "vinkos";
