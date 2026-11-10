import { createGoogle } from "@ai-sdk/google";
import { APICallError, wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from "ai";

/**
 * Model chain, cheapest first. gemini-3.1-flash-lite held up best in the
 * product-lab benchmark (module 2): same grounding as the bigger model at 1/8
 * of the cost. The others are backups; each model has its own free-tier quota,
 * so a longer chain also means more requests per day before the demo stops.
 */
export const MODEL_CHAIN = ["gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-3.6-flash"] as const;

/** How long a model gets to start answering before the call moves to the next one. */
export const FIRST_BYTE_TIMEOUT_MS = 15_000;

export class ModelTimeoutError extends Error {
  constructor(readonly modelId: string) {
    super(`${modelId} did not start answering within ${FIRST_BYTE_TIMEOUT_MS / 1000} s`);
  }
}

/** Errors another model can fix: no answer, overload, rate limit or quota (quotas are per model), server errors. */
export function shouldFallBack(error: unknown): boolean {
  if (error instanceof ModelTimeoutError) return true;
  return APICallError.isInstance(error) && [429, 500, 502, 503, 504].includes(error.statusCode ?? 0);
}

type Middleware = Required<Pick<LanguageModelMiddleware, "wrapGenerate" | "wrapStream">>;
type WrappableModel = Parameters<Middleware["wrapStream"]>[0]["model"];
type CallParams = Parameters<Middleware["wrapStream"]>[0]["params"];

type StreamResult = Awaited<ReturnType<WrappableModel["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;
type Call<T> = (model: WrappableModel, params: CallParams) => PromiseLike<T>;

/** Stream parts that arrive before the model has produced anything: they do not prove it is answering. */
const PREAMBLE_PARTS = new Set(["stream-start", "response-metadata"]);

/**
 * Reads the stream until the first real content part arrives (text, tool call...),
 * then hands back a stream that replays what was read and continues from there.
 * Needed because the API can open the connection at once and then send nothing.
 */
async function waitForContent(result: StreamResult, signal: AbortSignal): Promise<StreamResult> {
  const reader = result.stream.getReader();
  const buffered: StreamPart[] = [];
  const aborted = new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  let ended = false;
  try {
    while (true) {
      const next = await Promise.race([reader.read(), aborted]);
      if (next.done) {
        ended = true;
        break;
      }
      buffered.push(next.value);
      if (!PREAMBLE_PARTS.has(next.value.type)) break;
    }
  } catch (error) {
    reader.cancel().catch(() => {});
    throw error;
  }
  const stream = new ReadableStream<StreamPart>({
    start(controller) {
      for (const part of buffered) controller.enqueue(part);
      if (ended) controller.close();
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
  return { ...result, stream };
}

/**
 * Calls the model, but gives up if it has not produced content within
 * `timeoutMs`. The timer stops at the first content, so a long answer is never
 * cut in the middle. `untilContent` lets the stream path wait past the
 * connection opening, which can happen long before any content.
 */
async function callWithTimeout<T>(
  model: WrappableModel,
  params: CallParams,
  call: Call<T>,
  timeoutMs: number,
  untilContent?: (result: T, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new ModelTimeoutError(model.modelId)), timeoutMs);
  const signal = params.abortSignal ? AbortSignal.any([params.abortSignal, controller.signal]) : controller.signal;
  try {
    const result = await call(model, { ...params, abortSignal: signal });
    return untilContent ? await untilContent(result, controller.signal) : result;
  } catch (error) {
    // Normalize our own abort into a ModelTimeoutError, whatever shape the provider wrapped it in.
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Middleware that sends the same call to the next model when the current one
 * fails in a way another model can fix. On the free tier, "high demand" errors
 * and requests that never answer are frequent; without this, the customer
 * would wait and then see an error instead of an answer.
 */
export function fallbackMiddleware(backups: WrappableModel[], timeoutMs = FIRST_BYTE_TIMEOUT_MS): LanguageModelMiddleware {
  async function tryChain<T>(
    model: WrappableModel,
    params: CallParams,
    call: Call<T>,
    untilContent?: (result: T, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (const candidate of [model, ...backups]) {
      if (lastError !== undefined) console.warn(`model fallback → ${candidate.modelId} (${(lastError as Error).message.slice(0, 80)})`);
      try {
        return await callWithTimeout(candidate, params, call, timeoutMs, untilContent);
      } catch (error) {
        // The customer pressed "stop": do not try another model.
        if (params.abortSignal?.aborted || !shouldFallBack(error)) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }

  return {
    wrapGenerate: ({ model, params }) => tryChain(model, params, (m, p) => m.doGenerate(p)),
    wrapStream: ({ model, params }) => tryChain(model, params, (m, p) => m.doStream(p), waitForContent),
  };
}

export function createShopModel(apiKey = process.env.GEMINI_API_KEY): LanguageModel {
  const google = createGoogle({ apiKey });
  const [primary, ...backups] = MODEL_CHAIN.map((id) => google(id));
  return wrapLanguageModel({ model: primary!, middleware: fallbackMiddleware(backups) });
}
