"use client";
import { createContext, useContext, useState } from "react";

// FX-12: UN estado de picks (y de importe) para todo el feed. VerticalFeed es
// el dueño y lo expone por contexto; Historias (que vive dentro de su `intro`)
// lo consume: jugar desde una historia marca ✓ también en el slide vertical y
// al revés. Fuera del feed (sin provider) cada uso cae a su estado local.
export type PicksStore = {
  picks: Record<string, string>;
  setPick: (porraId: string, optionId: string) => void;
  stake: number;
  setStake: (n: number) => void;
};

export const PicksCtx = createContext<PicksStore | null>(null);

// Estado compartido con fallback local: si hay provider por encima, manda él.
export function usePicksStore(initialPicks: Record<string, string>): PicksStore {
  const shared = useContext(PicksCtx);
  const [picks, setPicks] = useState(initialPicks);
  const [stake, setStake] = useState(10);
  if (shared) return shared;
  return {
    picks,
    setPick: (porraId, optionId) => setPicks((m) => ({ ...m, [porraId]: optionId })),
    stake,
    setStake,
  };
}
