# Vitrine: an AI shopping assistant that answers with UI

A store where the customer talks to an assistant and the assistant answers with **real interface components**: product cards with filters, a comparison table, a product detail card. Not walls of text. The components are live: "Add" puts the product in the cart, "Details" asks the assistant a follow-up.

This is **Generative UI**: the model decides *which* component to show and with *what data*; the front end decides *how* it looks.

### ▶ [Live demo](https://ai-shopping-ui-five.vercel.app)

Try *"Compare os 3 notebooks mais bem avaliados"* or *"Tênis masculino até R$ 600"*. It runs on a free API key with a small daily quota, so on a busy day it may ask you to come back tomorrow (that message is part of the design, see [Reliability](#reliability-on-a-free-tier)).

```
"Compare os 3 notebooks mais bem avaliados"
   → searchProducts({ category: "laptops", sortBy: "rating", limit: 3 })   → product cards
   → compareProducts({ ids: [...] })                                       → comparison table
   → "O Huawei Matebook X Pro se destaca como a opção com a melhor avaliação…"
```

Built with Next.js 16, the Vercel AI SDK 7 (`streamText` + `useChat`) and Gemini. Interface in Portuguese (a Brazilian store); code and docs in English.

## How it works

### Tools are the only source of products

The model has three tools ([`src/lib/tools.ts`](src/lib/tools.ts)): `searchProducts` (keywords, category, price range, sorting), `compareProducts` and `getProductDetails`. The system prompt forbids citing any product, price or feature that did not come from a tool. This is the grounding lesson from [product-lab](https://github.com/Flaviohorbach/product-lab), applied to a chat: the model chooses and explains, the catalog provides the facts.

### Tool results become components

Every tool call arrives in the browser as a typed message part (`tool-searchProducts`, `tool-compareProducts`...). [`src/components/shop.tsx`](src/components/shop.tsx) switches on the part type and its state:

| Part state | What the customer sees |
| --- | --- |
| `input-streaming` / `input-available` | Skeleton cards and "Buscando “running shoes”…" |
| `output-available` | The component: cards, comparison table or detail card |
| `output-error` | A short error message in place of the component |

Because the parts are typed from the tool definitions (`InferUITools`), a change in a tool's output breaks the build instead of the page.

### The text stays short

The prompt tells the model not to repeat what the components already show. The text adds what a component cannot: which product stands out and why, or a question to narrow the search. Fewer output tokens also means a faster and cheaper answer.

### Filters made visible

Search results show the filters the model applied as chips ("Calçados masculinos", "até R$ 600,00"). If the model misunderstood the request, the customer sees it immediately instead of wondering why the results look wrong.

## Reliability on a free tier

The demo runs on a free Gemini key, which made the failure handling the most interesting part of the project.

**Model fallback with a first-content timeout** ([`src/lib/model.ts`](src/lib/model.ts)). During testing, Gemini failed in three different ways: `503 high demand`, `429` daily quota, and, worst of all, requests that opened the connection and then **sent nothing**, leaving the customer looking at "Pensando…" for over a minute. A middleware wraps the model:

- the call goes to `gemini-3.1-flash-lite` first (the cheapest model that held up in the product-lab benchmark);
- on 503, 429 or 5xx it moves to `gemini-3.8-flash`, then `gemini-3.6-flash`. Each model has its own quota, so the chain also multiplies the daily capacity;
- each model gets **15 seconds to produce its first piece of content**, not just to open the connection. The timer stops at the first content, so long answers are never cut;
- a bad request (400) does not fall back, since another model would fail the same way; neither does the customer pressing "Parar".

The first version only reacted to errors and did nothing about the silent hang. The second version timed the connection opening, which arrives at once even when no content follows. Both cases are now in the tests.

**Rate limit per visitor** ([`src/lib/rate-limit.ts`](src/lib/rate-limit.ts)): 12 messages per 10 minutes. On a public demo with a free key, one visitor or bot could otherwise use up the day for everyone. It is in memory, so it is per server instance; production would use Redis or similar.

**Errors the customer can read.** Raw API errors never reach the page. Quota, overload and unknown errors each become one sentence in Portuguese, with a "Tentar de novo" button.

**Bounded cost per message**: at most 4 model steps per message (`stepCountIs(4)`) and only the last 20 messages sent to the model.

## Accessibility

Keyboard-reachable controls with visible focus, a labelled input, `aria-live` on the conversation so screen readers hear new answers, `role="status"` on loading states, a real `<table>` with headers for the comparison, and reduced motion respected. Light and dark themes follow the system setting.

## Running

Requires Node.js 22+ and a free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

```bash
npm install
cp .env.example .env.local    # then paste your key into .env.local
npm run dev                   # http://localhost:3000
npm test                      # offline tests (fallback, search, rate limit)
npm run catalog               # rebuild the product catalog from DummyJSON
```

## Data

157 products in 21 categories from [DummyJSON](https://dummyjson.com), a free fake-data API, saved in [`src/data/catalog.json`](src/data/catalog.json) so the app does not depend on it at runtime. Prices were converted to BRL; product names and supplier descriptions stay in English, as they come from the supplier. Search is keyword-based on purpose: it becomes semantic search (embeddings) in module 6.

## What is next

- Semantic search with embeddings, so "algo para correr na chuva" works without the model translating keywords (module 6)
- Memory of the customer's preferences across visits (module 4)
- "Add to cart" decided by the assistant with a confirmation step (human-in-the-loop)

---

Project 3 of my Applied AI Engineering learning path (front-end focus). Concepts explained in Portuguese in [`docs/CONCEITOS.md`](docs/CONCEITOS.md).
