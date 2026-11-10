import type { Tier } from "./model";

export interface Route {
  tier: Tier;
  reason: string;
}

// Requests where a cheap model is more likely to slip: weighing options and
// explaining trade-offs, rather than finding products.
const NEEDS_REASONING = /\bcompar|diferen[cç]a|melhor (para|pra|entre|custo)|vale a pena|qual (escolho|devo|compro|é melhor)|pr[oó]s e contras|\bversus\b|\bvs\.?\s/i;

/**
 * Picks a tier with plain rules: no model call, so routing costs nothing and
 * adds no latency. Most messages are searches, which the fast tier handles;
 * the evaluation measures whether that holds.
 */
export function routeRequest(lastUserText: string, userTurns: number): Route {
  if (NEEDS_REASONING.test(lastUserText)) return { tier: "strong", reason: "pede comparação ou decisão" };
  if (lastUserText.length > 400) return { tier: "strong", reason: "mensagem longa" };
  if (userTurns > 8) return { tier: "strong", reason: "conversa longa" };
  return { tier: "fast", reason: "busca simples" };
}
