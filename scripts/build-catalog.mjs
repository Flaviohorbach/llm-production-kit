// Builds src/data/catalog.json from DummyJSON (free fake product data).
// Run once with `npm run catalog`; the result is committed so the app never
// depends on the external API at runtime.
import { mkdir, writeFile } from "node:fs/promises";

const CATEGORIES = {
  beauty: "Beleza",
  fragrances: "Perfumes",
  furniture: "Móveis",
  "home-decoration": "Decoração",
  "kitchen-accessories": "Cozinha",
  laptops: "Notebooks",
  "mens-shirts": "Camisas masculinas",
  "mens-shoes": "Calçados masculinos",
  "mens-watches": "Relógios masculinos",
  "mobile-accessories": "Acessórios para celular",
  "skin-care": "Cuidados com a pele",
  smartphones: "Smartphones",
  "sports-accessories": "Esporte",
  sunglasses: "Óculos de sol",
  tablets: "Tablets",
  tops: "Moda feminina",
  "womens-bags": "Bolsas",
  "womens-dresses": "Vestidos",
  "womens-jewellery": "Joias",
  "womens-shoes": "Calçados femininos",
  "womens-watches": "Relógios femininos",
};

// DummyJSON prices are in USD. A rough conversion keeps them plausible for a Brazilian store.
const toBRL = (usd) => Math.max(9.9, Math.round(usd * 5.5) - 0.1);

const response = await fetch(
  "https://dummyjson.com/products?limit=0&select=id,title,brand,category,price,rating,stock,description,tags,thumbnail",
);
const { products } = await response.json();

const catalog = products
  .filter((p) => p.category in CATEGORIES)
  .map((p) => ({
    id: p.id,
    title: p.title,
    brand: p.brand ?? null,
    category: p.category,
    categoryLabel: CATEGORIES[p.category],
    priceBRL: toBRL(p.price),
    rating: p.rating,
    stock: p.stock,
    description: p.description,
    tags: p.tags,
    image: p.thumbnail,
  }));

await mkdir("src/data", { recursive: true });
await writeFile("src/data/catalog.json", JSON.stringify(catalog, null, 2) + "\n");
console.log(`Saved ${catalog.length} products in ${new Set(catalog.map((p) => p.category)).size} categories.`);
