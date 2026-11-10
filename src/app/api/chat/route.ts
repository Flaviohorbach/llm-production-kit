import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { createShopModel } from "@/lib/model";
import { createRateLimiter } from "@/lib/rate-limit";
import { SYSTEM_PROMPT, tools, type ShopUIMessage } from "@/lib/tools";

const MAX_HISTORY = 20;

const model = createShopModel();
const rateLimit = createRateLimiter({ limit: 12, windowMs: 10 * 60_000 });

export const maxDuration = 30;

export async function POST(request: Request) {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const { allowed, retryAfterMs } = rateLimit(client);
  if (!allowed) {
    const minutes = Math.ceil(retryAfterMs / 60_000);
    return new Response(`Você enviou muitas mensagens seguidas. Tente de novo em ${minutes} min.`, { status: 429 });
  }

  const { messages }: { messages: ShopUIMessage[] } = await request.json();

  const result = streamText({
    model,
    // The fallback middleware already moves to another model on overload; one
    // retry on top is enough, more only makes the customer wait.
    maxRetries: 1,
    system: SYSTEM_PROMPT,
    // Only the recent history goes to the model: older turns cost tokens and rarely matter here.
    messages: await convertToModelMessages(messages.slice(-MAX_HISTORY)),
    tools,
    // Search, then maybe compare, then answer: a few steps are enough, and the cap prevents loops.
    stopWhen: stepCountIs(4),
    providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    // Errors reach the browser as this text, so they must be safe to show and helpful.
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (/per day|quota/i.test(message)) return "A demonstração atingiu o limite gratuito de hoje. Volte amanhã!";
      if (/high demand|overloaded|503/i.test(message)) return "O modelo está sobrecarregado agora. Tente de novo em alguns segundos.";
      // Configuration problems: the visitor cannot fix them, but the owner needs to know which one it is.
      if (/api key is missing|GEMINI_API_KEY/i.test(message)) return "A demonstração está sem a chave da IA configurada no servidor.";
      if (/API_KEY_INVALID|API key not valid/i.test(message)) return "A chave da IA configurada no servidor é inválida.";
      console.error("chat error:", message);
      return "Algo deu errado do nosso lado. Tente de novo.";
    },
  });
}
