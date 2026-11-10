import { LangfuseClient } from "@langfuse/client";
import { getActiveTraceId, observe, propagateAttributes, setActiveTraceAsPublic, updateActiveObservation } from "@langfuse/tracing";
import { trace } from "@opentelemetry/api";
import { convertToModelMessages, streamText } from "ai";
import { after } from "next/server";
import { langfuseSpanProcessor, tracingEnabled } from "@/instrumentation";
import { CHAT_SETTINGS, finishChat, prepareChat } from "@/lib/chat";
import { outputPassed } from "@/lib/guardrails";
import { createTierModels } from "@/lib/model";
import { costUSD } from "@/lib/pricing";
import { createRateLimiter } from "@/lib/rate-limit";
import type { ShopUIMessage } from "@/lib/tools";

const models = createTierModels();
const rateLimit = createRateLimiter({ limit: 12, windowMs: 10 * 60_000 });
const langfuse = tracingEnabled ? new LangfuseClient() : null;

/** Public link to a trace, so a visitor can see how an answer was made. */
const traceUrl = (traceId: string | undefined) =>
  traceId && process.env.LANGFUSE_PROJECT_ID
    ? `${process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com"}/project/${process.env.LANGFUSE_PROJECT_ID}/traces/${traceId}`
    : null;

// Two steps (search, then answer), each of which may wait 15 s for a slow model before
// falling back. 30 s cut answers off mid-way in production; 60 s fits two slow steps.
export const maxDuration = 60;

async function handler(request: Request) {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const { allowed, retryAfterMs } = rateLimit(client);
  if (!allowed) {
    const minutes = Math.ceil(retryAfterMs / 60_000);
    return new Response(`Você enviou muitas mensagens seguidas. Tente de novo em ${minutes} min.`, { status: 429 });
  }

  const { messages }: { messages: ShopUIMessage[] } = await request.json();
  const prepared = prepareChat(messages);
  const { route } = prepared;
  const started = Date.now();
  const traceId = getActiveTraceId();
  if (tracingEnabled) {
    // Personal data was masked above, so the trace can be shared from the page.
    setActiveTraceAsPublic();
    updateActiveObservation({ input: prepared.messages.at(-1)?.parts });
  }

  const tags = [`tier:${route.tier}`, ...(prepared.injectionSuspected ? ["injection-suspected"] : []), ...(prepared.maskedData.length ? ["personal-data-masked"] : [])];

  return propagateAttributes({ traceName: "shop-chat", tags, metadata: { routeReason: route.reason } }, async () => {
    let stepCost: number | null = 0;
    const stepModels = new Set<string>();

    const result = streamText({
      model: models[route.tier],
      ...CHAT_SETTINGS,
      messages: await convertToModelMessages(prepared.messages),
      providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
      // The model's inputs include the system prompt and its canary, and traces are
      // public. The customer's masked message is recorded on the root observation instead.
      telemetry: { functionId: "shop-chat", recordInputs: false },
      onFinish: async ({ text, steps }) => {
        const finished = finishChat(text, steps, prepared.lastUserText);
        if (!tracingEnabled) return;
        updateActiveObservation({ output: text, metadata: { ...finished, tier: route.tier } });
        // Scores make guardrail failures searchable and chartable in Langfuse.
        if (traceId && langfuse) {
          langfuse.score.create({ traceId, name: "output-guardrails", value: outputPassed(finished.check) ? 1 : 0, comment: JSON.stringify(finished.check) });
          if (finished.costUSD !== null) langfuse.score.create({ traceId, name: "cost-usd", value: finished.costUSD });
        }
        trace.getActiveSpan()?.end();
      },
      onError: async ({ error }) => {
        if (tracingEnabled) {
          updateActiveObservation({ output: String(error), level: "ERROR" });
          trace.getActiveSpan()?.end();
        }
      },
    });

    // On serverless, spans and scores still in memory when the function freezes are lost.
    after(async () => {
      await langfuseSpanProcessor?.forceFlush();
      await langfuse?.flush();
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      messageMetadata: ({ part }) => {
        if (part.type === "start") {
          return { tier: route.tier, routeReason: route.reason, injectionSuspected: prepared.injectionSuspected, maskedData: prepared.maskedData, traceUrl: traceUrl(traceId) };
        }
        if (part.type === "finish-step") {
          stepModels.add(part.response.modelId);
          const cost = costUSD(part.response.modelId, part.usage);
          stepCost = cost === null || stepCost === null ? null : stepCost + cost;
        }
        if (part.type === "finish") {
          return { models: [...stepModels], costUSD: stepCost, inputTokens: part.totalUsage.inputTokens, outputTokens: part.totalUsage.outputTokens, ms: Date.now() - started };
        }
        return undefined;
      },
      // Errors reach the browser as this text, so they must be safe to show and helpful.
      onError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (/per day|quota/i.test(message)) return "A demonstração atingiu o limite gratuito de hoje. Volte amanhã!";
        if (/high demand|overloaded|503/i.test(message)) return "O modelo está sobrecarregado agora. Tente de novo em alguns segundos.";
        if (/api key is missing|GEMINI_API_KEY/i.test(message)) return "A demonstração está sem a chave da IA configurada no servidor.";
        if (/API_KEY_INVALID|API key not valid/i.test(message)) return "A chave da IA configurada no servidor é inválida.";
        console.error("chat error:", message);
        return "Algo deu errado do nosso lado. Tente de novo.";
      },
    });
  });
}

// observe() opens the root observation; it ends when the stream finishes, not when the handler returns.
export const POST = tracingEnabled ? observe(handler, { name: "chat-request", endOnExit: false }) : handler;
