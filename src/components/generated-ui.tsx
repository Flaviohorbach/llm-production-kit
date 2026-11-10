"use client";

import Image from "next/image";
import { CATEGORIES, formatBRL, type Product, type ProductSummary, type SearchFilters } from "@/lib/catalog";
import { ProductCard, Rating } from "./product-card";
import { useShop } from "./shop-context";

/** Shows which filters the model applied, so the customer can see how it understood the request. */
function FilterChips({ filters }: { filters: SearchFilters }) {
  const chips = [
    filters.query && `“${filters.query}”`,
    filters.category && CATEGORIES[filters.category],
    filters.minPrice !== undefined && `a partir de ${formatBRL(filters.minPrice)}`,
    filters.maxPrice !== undefined && `até ${formatBRL(filters.maxPrice)}`,
    filters.sortBy && filters.sortBy !== "relevance" &&
      { "price-asc": "menor preço", "price-desc": "maior preço", rating: "mais bem avaliados" }[filters.sortBy],
  ].filter(Boolean) as string[];

  if (chips.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Filtros aplicados">
      {chips.map((chip) => (
        <li key={chip} className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
          {chip}
        </li>
      ))}
    </ul>
  );
}

export function ProductResults({ products, total, filters }: { products: ProductSummary[]; total: number; filters: SearchFilters }) {
  return (
    <section className="flex flex-col gap-3" aria-label="Produtos encontrados">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">
          {total === 0 ? "Nenhum produto encontrado" : `${products.length} de ${total} ${total === 1 ? "produto" : "produtos"}`}
        </p>
        <FilterChips filters={filters} />
      </div>
      {products.length > 0 && (
        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}

type ComparedProduct = ProductSummary & Pick<Product, "stock" | "description">;

export function ComparisonTable({ products }: { products: ComparedProduct[] }) {
  const { addToCart } = useShop();
  const cheapest = Math.min(...products.map((p) => p.priceBRL));
  const bestRated = Math.max(...products.map((p) => p.rating));
  const best = "rounded-md bg-accent-soft px-2 py-0.5 font-semibold text-accent";

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[520px] text-sm">
        <caption className="sr-only">Comparação de produtos</caption>
        <thead>
          <tr>
            <th scope="col" className="w-28 p-3 text-left text-xs font-medium uppercase tracking-wide text-muted">Produto</th>
            {products.map((p) => (
              <th key={p.id} scope="col" className="p-3 text-left align-top font-normal">
                <div className="relative mb-2 aspect-square w-20 rounded-xl bg-surface-2">
                  <Image src={p.image} alt="" fill sizes="80px" className="object-contain p-2" />
                </div>
                <span className="font-display font-semibold leading-snug">{p.title}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:p-3 [&_th]:p-3 [&_tr]:border-t [&_tr]:border-line">
          <tr>
            <th scope="row" className="text-left text-muted">Preço</th>
            {products.map((p) => (
              <td key={p.id} className="tabular-nums">
                <span className={p.priceBRL === cheapest ? best : "text-price"}>{formatBRL(p.priceBRL)}</span>
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className="text-left text-muted">Avaliação</th>
            {products.map((p) => (
              <td key={p.id}>
                <span className={p.rating === bestRated ? best : ""}>★ {p.rating.toFixed(1)}</span>
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className="text-left text-muted">Marca</th>
            {products.map((p) => <td key={p.id}>{p.brand ?? "—"}</td>)}
          </tr>
          <tr>
            <th scope="row" className="text-left text-muted">Estoque</th>
            {products.map((p) => <td key={p.id}>{p.stock > 10 ? "Disponível" : p.stock > 0 ? `Últimas ${p.stock} unidades` : "Esgotado"}</td>)}
          </tr>
          <tr>
            <th scope="row" className="text-left text-muted"><span className="sr-only">Ações</span></th>
            {products.map((p) => (
              <td key={p.id}>
                <button type="button" onClick={() => addToCart(p)} className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  Adicionar
                </button>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function ProductDetail({ product }: { product: Product }) {
  const { addToCart } = useShop();
  return (
    <article className="grid gap-5 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-[200px_1fr]">
      <div className="relative aspect-square rounded-xl bg-surface-2">
        <Image src={product.image} alt={product.title} fill sizes="200px" className="object-contain p-4" />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{product.categoryLabel}</p>
        <h3 className="font-display text-xl font-semibold text-balance">{product.title}</h3>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display text-2xl font-semibold text-price tabular-nums">{formatBRL(product.priceBRL)}</span>
          <Rating value={product.rating} />
          <span className="text-sm text-muted">{product.stock > 0 ? `${product.stock} em estoque` : "Esgotado"}</span>
        </div>
        <p className="text-sm leading-relaxed">
          <span className="text-muted">Descrição do fornecedor: </span>
          <span lang="en">{product.description}</span>
        </p>
        <div className="mt-2">
          <button type="button" onClick={() => addToCart(product)} className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Adicionar ao carrinho
          </button>
        </div>
      </div>
    </article>
  );
}

/** Placeholder while a tool runs, so the customer sees the assistant working instead of a frozen chat. */
export function ToolPending({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-3" role="status">
      <p className="text-sm text-muted">{label}</p>
      <div className="flex gap-3 overflow-hidden" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-72 w-56 shrink-0 animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
