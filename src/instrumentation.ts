import { LangfuseSpanProcessor } from "@langfuse/otel";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { registerTelemetry } from "ai";

/** Tracing is optional: without Langfuse keys the app runs the same, untraced. */
export const tracingEnabled = Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);

// "immediate": on serverless, spans held in a batch are lost when the function freezes.
export const langfuseSpanProcessor = tracingEnabled ? new LangfuseSpanProcessor({ exportMode: "immediate" }) : null;

export function register() {
  if (!langfuseSpanProcessor || process.env.NEXT_RUNTIME !== "nodejs") return;
  new NodeTracerProvider({ spanProcessors: [langfuseSpanProcessor] }).register();
  registerTelemetry(new LangfuseVercelAiSdkIntegration());
}
