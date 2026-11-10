import { APICallError } from "ai";
import { describe, expect, it, vi } from "vitest";
import { fallbackMiddleware, ModelTimeoutError } from "@/lib/model";

type Middleware = ReturnType<typeof fallbackMiddleware>;
type StreamArgs = Parameters<NonNullable<Middleware["wrapStream"]>>[0];
type Part = { type: string; delta?: string };

const apiError = (statusCode: number) =>
  new APICallError({ message: `HTTP ${statusCode}`, url: "https://example.com", requestBodyValues: {}, statusCode });

/** A stream that emits the given parts, then either closes or stays silent until aborted. */
function partStream(parts: Part[], { silentAfter = false, signal }: { silentAfter?: boolean; signal?: AbortSignal } = {}) {
  return new ReadableStream<Part>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      if (!silentAfter) controller.close();
      else signal?.addEventListener("abort", () => controller.error(new Error("aborted")));
    },
  });
}

type Behavior = "ok" | "hang" | "silent-stream" | Error;

/**
 * Fake model. "ok" streams a preamble and one text part; "hang" never responds;
 * "silent-stream" opens the stream (preamble only) and then sends nothing,
 * which is what the free tier does under load.
 */
function fakeModel(modelId: string, behavior: Behavior) {
  const doStream = vi.fn((params: { abortSignal?: AbortSignal }) => {
    if (behavior === "ok") return Promise.resolve({ stream: partStream([{ type: "stream-start" }, { type: "text-delta", delta: modelId }]) });
    if (behavior === "silent-stream") {
      return Promise.resolve({ stream: partStream([{ type: "stream-start" }], { silentAfter: true, signal: params.abortSignal }) });
    }
    if (behavior === "hang") {
      return new Promise((_, reject) => params.abortSignal?.addEventListener("abort", () => reject(new Error("aborted"))));
    }
    return Promise.reject(behavior);
  });
  return { specificationVersion: "v4", provider: "fake", modelId, supportedUrls: {}, doGenerate: vi.fn(), doStream } as unknown as StreamArgs["model"] & {
    doStream: typeof doStream;
  };
}

async function streamFrom(primary: ReturnType<typeof fakeModel>, backups: ReturnType<typeof fakeModel>[], params: object = {}) {
  const middleware = fallbackMiddleware(backups, 30);
  return middleware.wrapStream!({ model: primary, params: { prompt: [], ...params }, doStream: primary.doStream, doGenerate: primary.doGenerate } as unknown as StreamArgs);
}

/** Which model answered: the text of the stream, read to the end. */
async function answeredBy(result: Awaited<ReturnType<typeof streamFrom>>) {
  const parts: Part[] = [];
  const reader = (result.stream as ReadableStream<Part>).getReader();
  for (let next = await reader.read(); !next.done; next = await reader.read()) parts.push(next.value);
  expect(parts[0]).toEqual({ type: "stream-start" }); // parts read while waiting are replayed, not lost
  return parts.map((p) => p.delta ?? "").join("");
}

describe("fallbackMiddleware", () => {
  it("uses the primary model when it answers", async () => {
    const backup = fakeModel("backup", "ok");
    expect(await answeredBy(await streamFrom(fakeModel("primary", "ok"), [backup]))).toBe("primary");
    expect(backup.doStream).not.toHaveBeenCalled();
  });

  it("moves to the backup when the primary is overloaded (503) or out of quota (429)", async () => {
    expect(await answeredBy(await streamFrom(fakeModel("primary", apiError(503)), [fakeModel("backup", "ok")]))).toBe("backup");
    expect(await answeredBy(await streamFrom(fakeModel("primary", apiError(429)), [fakeModel("backup", "ok")]))).toBe("backup");
  });

  it("moves to the backup when the primary never responds", async () => {
    expect(await answeredBy(await streamFrom(fakeModel("primary", "hang"), [fakeModel("backup", "ok")]))).toBe("backup");
  });

  it("moves to the backup when the primary opens the stream but sends no content", async () => {
    expect(await answeredBy(await streamFrom(fakeModel("primary", "silent-stream"), [fakeModel("backup", "ok")]))).toBe("backup");
  });

  it("walks the whole chain and reports the last error when every model fails", async () => {
    const result = streamFrom(fakeModel("a", apiError(503)), [fakeModel("b", "silent-stream"), fakeModel("c", apiError(429))]);
    await expect(result).rejects.toMatchObject({ statusCode: 429 });
  });

  it("does not fall back on errors another model would repeat, like a bad request", async () => {
    const backup = fakeModel("backup", "ok");
    await expect(streamFrom(fakeModel("primary", apiError(400)), [backup])).rejects.toMatchObject({ statusCode: 400 });
    expect(backup.doStream).not.toHaveBeenCalled();
  });

  it("does not fall back when the customer pressed stop", async () => {
    const controller = new AbortController();
    controller.abort();
    const backup = fakeModel("backup", "ok");
    await expect(streamFrom(fakeModel("primary", apiError(503)), [backup], { abortSignal: controller.signal })).rejects.toBeTruthy();
    expect(backup.doStream).not.toHaveBeenCalled();
  });

  it("reports a timeout as ModelTimeoutError", async () => {
    await expect(streamFrom(fakeModel("primary", "silent-stream"), [])).rejects.toBeInstanceOf(ModelTimeoutError);
  });
});
