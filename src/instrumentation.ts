import { LangfuseSpanProcessor } from "@langfuse/otel";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { registerTelemetry } from "ai";

/**
 * Tracing is optional, and a broken tracing setup must never take the store
 * down. Missing keys or an invalid URL (a value pasted with its quotes, for
 * example) turn tracing off with a warning instead of failing the build.
 */
function tracingConfigProblem(): string | null {
  const { LANGFUSE_PUBLIC_KEY: pk, LANGFUSE_SECRET_KEY: sk, LANGFUSE_BASE_URL: url } = process.env;
  if (!pk || !sk) return "keys not set";
  if (!pk.startsWith("pk-lf-") || !sk.startsWith("sk-lf-")) return "keys do not look like Langfuse keys (quotes around them?)";
  if (url && !URL.canParse(url)) return "LANGFUSE_BASE_URL is not a valid URL (quotes around it?)";
  return null;
}

const problem = tracingConfigProblem();
if (problem && problem !== "keys not set") console.warn(`Langfuse tracing is off: ${problem}`);

export const tracingEnabled = problem === null;

// "immediate": on serverless, spans held in a batch are lost when the function freezes.
export const langfuseSpanProcessor = tracingEnabled ? new LangfuseSpanProcessor({ exportMode: "immediate" }) : null;

export function register() {
  if (!langfuseSpanProcessor || process.env.NEXT_RUNTIME !== "nodejs") return;
  new NodeTracerProvider({ spanProcessors: [langfuseSpanProcessor] }).register();
  registerTelemetry(new LangfuseVercelAiSdkIntegration());
}
