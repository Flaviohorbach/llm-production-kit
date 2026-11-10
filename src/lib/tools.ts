import { tool, type InferUITools, type UIMessage } from "ai";
import { z } from "zod";
import { CATEGORIES, CATEGORY_IDS, getProducts, searchProducts, summarize } from "./catalog";

/**
 * The model never invents products: every product it talks about comes from
 * one of these tools. Each tool result is also what the UI renders as a
 * component (carousel, comparison table, detail card): that is Generative UI.
 */
export const tools = {
  searchProducts: tool({
    description:
      "Search the store catalog. The catalog is in English: translate the customer's words into English keywords " +
      "(e.g. 'tênis de corrida' → 'running shoes sneakers'). Use filters when the customer gives a budget or category.",
    inputSchema: z.object({
      query: z.string().optional().describe("English keywords. Omit to list a whole category."),
      category: z.enum(CATEGORY_IDS).optional().describe(`One of: ${Object.entries(CATEGORIES).map(([id, label]) => `${id} (${label})`).join(", ")}`),
      minPrice: z.number().optional().describe("Minimum price in BRL"),
      maxPrice: z.number().optional().describe("Maximum price in BRL"),
      sortBy: z.enum(["relevance", "price-asc", "price-desc", "rating"]).optional(),
      limit: z.number().int().min(1).max(8).optional().describe("How many products to show, default 6"),
    }),
    execute: async (filters) => ({ ...searchProducts(filters), filters }),
  }),

  compareProducts: tool({
    description: "Show a side-by-side comparison of 2 to 4 products. Use ids returned by searchProducts.",
    inputSchema: z.object({ ids: z.array(z.number().int()).min(2).max(4) }),
    execute: async ({ ids }) => ({
      products: getProducts(ids).map((p) => ({ ...summarize(p), brand: p.brand, stock: p.stock, description: p.description })),
    }),
  }),

  getProductDetails: tool({
    description: "Show the full detail card of one product. Use an id returned by searchProducts.",
    inputSchema: z.object({ id: z.number().int() }),
    execute: async ({ id }) => {
      const [product] = getProducts([id]);
      return product ? { product } : { error: `No product with id ${id}` };
    },
  }),
};

export type ShopUIMessage = UIMessage<never, never, InferUITools<typeof tools>>;

export const SYSTEM_PROMPT = `Você é a assistente de compras da Vitrine, uma loja online brasileira.

Como trabalhar:
- Toda informação sobre produtos (nome, preço, avaliação, estoque) vem das ferramentas. Nunca cite um produto, preço ou característica que não veio de uma ferramenta.
- A interface mostra o resultado de cada ferramenta como componente visual (cards, tabela de comparação, ficha do produto). Por isso, não repita no texto a lista de produtos, os preços ou a tabela: escreva no máximo duas frases que ajudem a decidir (por exemplo, qual se destaca e por quê, ou o que perguntar a seguir).
- Se o pedido for vago ("um presente"), faça uma pergunta curta antes de buscar, ou busque algo amplo e pergunte como refinar.
- Se a busca não encontrar nada, diga isso com franqueza e sugira uma alternativa próxima que exista no catálogo.
- Responda sempre em português do Brasil, em tom simpático e direto, sem markdown.`;
