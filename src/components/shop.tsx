"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { formatBRL, type ProductSummary } from "@/lib/catalog";
import type { ShopUIMessage } from "@/lib/tools";
import { ComparisonTable, ProductDetail, ProductResults, ToolPending } from "./generated-ui";
import { ShopContext, type CartItem } from "./shop-context";

const SUGGESTIONS = [
  "Tênis masculino até R$ 600",
  "Compare os 3 notebooks mais bem avaliados",
  "Um presente para quem gosta de cozinhar",
  "Óculos de sol mais baratos",
];

/** Renders one message part. Tool parts become components: this switch is the Generative UI. */
function MessagePart({ part }: { part: ShopUIMessage["parts"][number] }) {
  switch (part.type) {
    case "text":
      return part.text ? <p className="leading-relaxed whitespace-pre-wrap">{part.text}</p> : null;

    case "tool-searchProducts":
      if (part.state === "output-available") return <ProductResults {...part.output} />;
      if (part.state === "output-error") return <p className="text-sm text-danger">A busca falhou: {part.errorText}</p>;
      return <ToolPending label={part.input?.query ? `Buscando “${part.input.query}”…` : "Buscando produtos…"} />;

    case "tool-compareProducts":
      if (part.state === "output-available") return <ComparisonTable products={part.output.products} />;
      if (part.state === "output-error") return <p className="text-sm text-danger">A comparação falhou: {part.errorText}</p>;
      return <ToolPending label="Montando a comparação…" />;

    case "tool-getProductDetails":
      if (part.state === "output-available") {
        return part.output.product ? <ProductDetail product={part.output.product} /> : <p className="text-sm text-danger">Produto não encontrado.</p>;
      }
      if (part.state === "output-error") return <p className="text-sm text-danger">Não consegui abrir o produto: {part.errorText}</p>;
      return <ToolPending label="Abrindo o produto…" />;

    default:
      return null;
  }
}

function CartButton({ cart, open, onToggle }: { cart: CartItem[]; open: boolean; onToggle: () => void }) {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="cart-panel"
      className="relative shrink-0 whitespace-nowrap rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      Carrinho
      <span className="ml-2 inline-grid min-w-6 place-items-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-ink tabular-nums" aria-label={`${count} itens`}>
        {count}
      </span>
    </button>
  );
}

function CartPanel({ cart }: { cart: CartItem[] }) {
  const total = cart.reduce((sum, item) => sum + item.product.priceBRL * item.quantity, 0);
  return (
    <aside id="cart-panel" className="rounded-2xl border border-line bg-surface p-4" aria-label="Carrinho">
      {cart.length === 0 ? (
        <p className="text-sm text-muted">Seu carrinho está vazio. Use “Adicionar” nos produtos da conversa.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {cart.map(({ product, quantity }) => (
              <li key={product.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{quantity}× {product.title}</span>
                <span className="tabular-nums text-muted">{formatBRL(product.priceBRL * quantity)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between border-t border-line pt-3 font-semibold">
            <span>Total</span>
            <span className="tabular-nums text-price">{formatBRL(total)}</span>
          </p>
        </>
      )}
    </aside>
  );
}

export function Shop() {
  const { messages, sendMessage, status, error, stop, regenerate, clearError } = useChat<ShopUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [input, setInput] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  const ask = useCallback(
    (text: string) => {
      if (!text.trim() || busy) return;
      clearError();
      sendMessage({ text });
    },
    [busy, clearError, sendMessage],
  );

  const addToCart = useCallback((product: ProductSummary) => {
    setCart((items) => {
      const existing = items.find((item) => item.product.id === product.id);
      return existing
        ? items.map((item) => (item === existing ? { ...item, quantity: item.quantity + 1 } : item))
        : [...items, { product, quantity: 1 }];
    });
  }, []);

  const actions = useMemo(() => ({ cart, addToCart, ask, busy }), [cart, addToCart, ask, busy]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    ask(input);
    setInput("");
  }

  return (
    <ShopContext value={actions}>
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-bg/90 py-4 backdrop-blur">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Vitrine</h1>
            <p className="hidden text-sm text-muted sm:block">Converse com a loja. Ela responde com produtos de verdade.</p>
          </div>
          <CartButton cart={cart} open={cartOpen} onToggle={() => setCartOpen((open) => !open)} />
        </header>

        {cartOpen && <CartPanel cart={cart} />}

        <main className="flex flex-1 flex-col gap-6 py-6" aria-live="polite" aria-busy={busy}>
          {messages.length === 0 && (
            <section className="flex flex-1 flex-col justify-center gap-5 py-10">
              <h2 className="max-w-xl font-display text-3xl font-semibold leading-tight text-balance sm:text-4xl">
                O que você está procurando hoje?
              </h2>
              <p className="max-w-xl text-muted">
                Peça do seu jeito: com orçamento, para presente, comparando opções. A assistente busca no catálogo e monta a vitrine para você.
              </p>
              <ul className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <li key={suggestion}>
                    <button
                      type="button"
                      onClick={() => ask(suggestion)}
                      className="rounded-full border border-line bg-surface px-4 py-2 text-sm transition hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-accent-ink">
                {message.parts.map((part, i) => (part.type === "text" ? <p key={i}>{part.text}</p> : null))}
              </div>
            ) : (
              <div key={message.id} className="flex min-w-0 flex-col gap-4">
                {message.parts.map((part, i) => (
                  <MessagePart key={i} part={part} />
                ))}
              </div>
            ),
          )}

          {status === "submitted" && <p className="text-sm text-muted" role="status">Pensando…</p>}

          {error && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/40 bg-surface p-4 text-sm" role="alert">
              <span className="text-danger">{error.message || "Não foi possível responder agora."}</span>
              <button type="button" onClick={() => { clearError(); regenerate(); }} className="font-semibold text-accent underline underline-offset-4">
                Tentar de novo
              </button>
            </div>
          )}
          {/* scroll-margin keeps the newest content above the sticky message box when auto-scrolling */}
          <div ref={endRef} className="scroll-mb-28" />
        </main>

        <form onSubmit={onSubmit} className="sticky bottom-0 flex gap-2 bg-bg/90 py-4 backdrop-blur">
          <label htmlFor="chat-input" className="sr-only">Mensagem para a assistente</label>
          <input
            id="chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ex.: tênis de corrida até R$ 500"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-full border border-line bg-surface px-5 py-3 placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          {busy ? (
            <button type="button" onClick={() => stop()} className="rounded-full border border-line bg-surface px-5 py-3 font-semibold">
              Parar
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="rounded-full bg-accent px-5 py-3 font-semibold text-accent-ink disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              Enviar
            </button>
          )}
        </form>
      </div>
    </ShopContext>
  );
}
