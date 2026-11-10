import { stepCountIs, type LanguageModel, type StepResult, type ToolSet } from "ai";
import { checkOutput, looksLikeInjection, maskPersonalData, type OutputCheck } from "./guardrails";
import type { Tier } from "./model";
import { costUSD } from "./pricing";
import { routeRequest, type Route } from "./router";
import { SYSTEM_PROMPT, tools, type ShopUIMessage } from "./tools";

/** Only the recent history goes to the model: older turns cost tokens and rarely matter here. */
export const MAX_HISTORY = 20;

/** Search, then maybe compare, then answer: a few steps are enough, and the cap prevents loops. */
export const CHAT_SETTINGS = { system: SYSTEM_PROMPT, tools, stopWhen: stepCountIs(4), maxRetries: 1 } as const;

export interface Prepared {
  messages: ShopUIMessage[];
  route: Route;
  injectionSuspected: boolean;
  maskedData: string[];
}

const textOf = (message: ShopUIMessage) => message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(" ");

/**
 * Everything that happens before the model: trim history, mask personal
 * data, flag likely injections and pick a tier. Shared by the route and the
 * evaluation, so what is tested is what runs.
 */
export function prepareChat(all: ShopUIMessage[]): Prepared {
  const maskedData: string[] = [];
  const messages = all.slice(-MAX_HISTORY).map((m) => {
    if (m.role !== "user") return m;
    return {
      ...m,
      parts: m.parts.map((p) => {
        if (p.type !== "text") return p;
        const { text, masked } = maskPersonalData(p.text);
        maskedData.push(...masked);
        return { ...p, text };
      }),
    };
  });
  const users = messages.filter((m) => m.role === "user");
  const lastUserText = users.length ? textOf(users[users.length - 1]!) : "";
  return {
    messages,
    route: routeRequest(lastUserText, all.filter((m) => m.role === "user").length),
    injectionSuspected: looksLikeInjection(lastUserText),
    maskedData,
  };
}

export interface Finished {
  check: OutputCheck;
  costUSD: number | null;
  inputTokens: number;
  outputTokens: number;
  modelCalls: number;
  models: string[];
  toolCalls: { name: string; input: unknown }[];
}

/** Prices any tool showed to the customer: the only prices the text may mention. */
function toolPrices(steps: StepResult<ToolSet>[]): number[] {
  const prices: number[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      for (const [key, v] of Object.entries(value)) (key === "priceBRL" && typeof v === "number" ? prices.push(v) : visit(v));
    }
  };
  for (const step of steps) for (const result of step.toolResults) visit(result.output);
  return prices;
}

/** Everything after the model: output checks and cost, per step, by the model that really answered. */
export function finishChat(text: string, steps: StepResult<ToolSet>[]): Finished {
  let cost: number | null = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const step of steps) {
    inputTokens += step.usage.inputTokens ?? 0;
    outputTokens += step.usage.outputTokens ?? 0;
    const c = costUSD(step.response.modelId, step.usage);
    cost = c === null || cost === null ? null : cost + c;
  }
  return {
    check: checkOutput(text, toolPrices(steps)),
    costUSD: cost,
    inputTokens,
    outputTokens,
    modelCalls: steps.length,
    models: [...new Set(steps.map((s) => s.response.modelId))],
    toolCalls: steps.flatMap((s) => s.toolCalls.map((c) => ({ name: c.toolName, input: c.input }))),
  };
}

export type TierModels = Record<Tier, LanguageModel>;
