/**
 * Paid-tier list prices in USD per million tokens, from
 * https://aistudio.google.com/docs/pricing (standard tier, text), read on
 * 2026-11-10. The Flash prices double on 2027-01-01. The demo runs on the free
 * tier, so this is what each request would cost in production, not a bill.
 */
export const PRICES_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.6-flash": { input: 0.75, output: 3.75 },
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
};

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

/** Cost of one call. Unknown models return null rather than a wrong number. */
export function costUSD(modelId: string, usage: Usage): number | null {
  const price = Object.entries(PRICES_USD_PER_MILLION).find(([id]) => modelId.includes(id))?.[1];
  if (!price) return null;
  return ((usage.inputTokens ?? 0) * price.input + (usage.outputTokens ?? 0) * price.output) / 1_000_000;
}
