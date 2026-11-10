import { describe, expect, it } from "vitest";
import { catalog, getProducts, searchProducts } from "@/lib/catalog";
import { createRateLimiter } from "@/lib/rate-limit";

describe("searchProducts", () => {
  it("finds products by keyword and ranks title matches first", () => {
    const { products } = searchProducts({ query: "laptop" });
    expect(products.length).toBeGreaterThan(0);
    expect(products.every((p) => p.categoryLabel === "Notebooks")).toBe(true);
  });

  it("ignores accents and case", () => {
    expect(searchProducts({ query: "WATCH" }).total).toBe(searchProducts({ query: "wátch" }).total);
  });

  it("applies category and price filters", () => {
    const { products } = searchProducts({ category: "mens-shoes", maxPrice: 600 });
    expect(products.length).toBeGreaterThan(0);
    for (const p of products) expect(p.priceBRL).toBeLessThanOrEqual(600);
  });

  it("sorts by price and by rating", () => {
    const cheap = searchProducts({ category: "sunglasses", sortBy: "price-asc" }).products.map((p) => p.priceBRL);
    expect(cheap).toEqual([...cheap].sort((a, b) => a - b));
    const rated = searchProducts({ category: "laptops", sortBy: "rating" }).products.map((p) => p.rating);
    expect(rated).toEqual([...rated].sort((a, b) => b - a));
  });

  it("returns nothing, honestly, when nothing matches", () => {
    expect(searchProducts({ query: "xyzzy-nonexistent" })).toEqual({ products: [], total: 0 });
  });

  it("respects the limit but reports the full total", () => {
    const { products, total } = searchProducts({ category: "smartphones", limit: 2 });
    expect(products).toHaveLength(2);
    expect(total).toBeGreaterThan(2);
  });
});

describe("getProducts", () => {
  it("returns products in the requested order and skips unknown ids", () => {
    const [a, b] = catalog;
    expect(getProducts([b!.id, 999_999, a!.id]).map((p) => p.id)).toEqual([b!.id, a!.id]);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit inside the window, then blocks until it slides", () => {
    const check = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(check("ip", 0).allowed).toBe(true);
    expect(check("ip", 100).allowed).toBe(true);
    expect(check("ip", 200)).toEqual({ allowed: false, retryAfterMs: 800 });
    expect(check("ip", 1001).allowed).toBe(true);
    expect(check("other-ip", 200).allowed).toBe(true);
  });
});
