import catalogData from "@/data/catalog.json";

export interface Product {
  id: number;
  title: string;
  brand: string | null;
  category: string;
  categoryLabel: string;
  priceBRL: number;
  rating: number;
  stock: number;
  description: string;
  tags: string[];
  image: string;
}

/** What the model and the product cards need. Descriptions stay out to save tokens. */
export type ProductSummary = Pick<Product, "id" | "title" | "brand" | "categoryLabel" | "priceBRL" | "rating" | "image">;

export const catalog: Product[] = catalogData;

export const CATEGORIES = Object.fromEntries(catalog.map((p) => [p.category, p.categoryLabel]));
export const CATEGORY_IDS = Object.keys(CATEGORIES) as [string, ...string[]];

export const summarize = ({ id, title, brand, categoryLabel, priceBRL, rating, image }: Product): ProductSummary => ({
  id, title, brand, categoryLabel, priceBRL, rating, image,
});

const normalize = (text: string) =>
  text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export interface SearchFilters {
  query?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: "relevance" | "price-asc" | "price-desc" | "rating";
  limit?: number;
}

/**
 * Keyword search with filters. Deliberately simple: module 6 replaces the
 * scoring with semantic search (embeddings). The model translates the
 * customer's words into English keywords, since the catalog is in English.
 */
export function searchProducts(filters: SearchFilters): { products: ProductSummary[]; total: number } {
  const { query, category, minPrice, maxPrice, sortBy = "relevance", limit = 6 } = filters;
  const words = query ? normalize(query).split(/\W+/).filter((w) => w.length > 1) : [];

  const scored = catalog
    .filter((p) => !category || p.category === category)
    .filter((p) => minPrice === undefined || p.priceBRL >= minPrice)
    .filter((p) => maxPrice === undefined || p.priceBRL <= maxPrice)
    .map((p) => {
      const fields = [
        [normalize(p.title), 3],
        [normalize(p.tags.join(" ")), 2],
        [normalize(`${p.category} ${p.brand ?? ""}`), 2],
        [normalize(p.description), 1],
      ] as const;
      const score = words.reduce(
        (total, word) => total + fields.reduce((sum, [text, weight]) => sum + (text.includes(word) ? weight : 0), 0),
        0,
      );
      return { product: p, score };
    })
    .filter(({ score }) => words.length === 0 || score > 0);

  const sorters = {
    relevance: (a: (typeof scored)[number], b: (typeof scored)[number]) => b.score - a.score || b.product.rating - a.product.rating,
    "price-asc": (a: (typeof scored)[number], b: (typeof scored)[number]) => a.product.priceBRL - b.product.priceBRL,
    "price-desc": (a: (typeof scored)[number], b: (typeof scored)[number]) => b.product.priceBRL - a.product.priceBRL,
    rating: (a: (typeof scored)[number], b: (typeof scored)[number]) => b.product.rating - a.product.rating,
  };

  const sorted = scored.sort(sorters[sortBy]);
  return { products: sorted.slice(0, limit).map(({ product }) => summarize(product)), total: sorted.length };
}

export function getProducts(ids: number[]): Product[] {
  return ids.map((id) => catalog.find((p) => p.id === id)).filter((p): p is Product => Boolean(p));
}

export const formatBRL = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
