import "server-only";

import type { Category, ProductDetail, ProductCard, ProductList } from "./types";

const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export class BackendError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Server-side fetch straight to Django (no browser cookies involved). */
async function get<T>(path: string, revalidate = 0): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      headers: { Accept: "application/json" },
      // Stock levels must be fresh, so product data is never cached.
      ...(revalidate > 0 ? { next: { revalidate } } : { cache: "no-store" as const }),
    });
  } catch {
    throw new BackendError(503, "The catalog service is unreachable.");
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      message = (await res.json())?.error?.message ?? message;
    } catch {}
    throw new BackendError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export function getCategories() {
  return get<{ results: Category[] }>("/api/categories/", 60).then((d) => d.results);
}

export function getProducts(params: URLSearchParams) {
  const qs = params.toString();
  return get<ProductList>(`/api/products/${qs ? `?${qs}` : ""}`);
}

export function getProduct(slug: string) {
  return get<{ product: ProductDetail; related: ProductCard[] }>(`/api/products/${encodeURIComponent(slug)}/`);
}
