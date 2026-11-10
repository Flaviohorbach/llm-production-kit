"use client";

import Image from "next/image";
import { formatBRL, type ProductSummary } from "@/lib/catalog";
import { useShop } from "./shop-context";

export function Rating({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted" aria-label={`Avaliação ${value.toFixed(1)} de 5`}>
      <span aria-hidden className="text-price">★</span>
      {value.toFixed(1)}
    </span>
  );
}

export function ProductCard({ product }: { product: ProductSummary }) {
  const { addToCart, ask, busy } = useShop();
  return (
    <article className="flex w-56 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="relative aspect-square bg-surface-2">
        <Image src={product.image} alt={product.title} fill sizes="224px" className="object-contain p-4" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{product.categoryLabel}</p>
        <h3 className="font-display text-base font-semibold leading-snug text-balance">{product.title}</h3>
        {product.brand && <p className="text-sm text-muted">{product.brand}</p>}
        <div className="mt-auto flex items-baseline justify-between pt-2">
          <span className="font-display text-lg font-semibold text-price tabular-nums">{formatBRL(product.priceBRL)}</span>
          <Rating value={product.rating} />
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => addToCart(product)}
            className="flex-1 rounded-full bg-accent px-3 py-2 text-sm font-semibold text-accent-ink transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Adicionar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => ask(`Quero ver os detalhes do produto "${product.title}" (id ${product.id}).`)}
            className="rounded-full border border-line px-3 py-2 text-sm font-medium transition hover:bg-surface-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Detalhes
          </button>
        </div>
      </div>
    </article>
  );
}
