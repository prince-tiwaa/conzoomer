import "server-only";

import type { Category, ProductDetail, ProductCard, ProductList } from "./types";

const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export class BackendError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const WAKE_STATUSES = new Set([502, 503, 504]);
const WAKE_TIMEOUT_MS = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Server-side fetch straight to Django (no browser cookies involved).
 *  Free hosting puts the API to sleep when idle; while it wakes up it answers
 *  502/503, so we keep retrying for up to a minute instead of failing. */
async function get<T>(path: string, revalidate = 0): Promise<T> {
  const deadline = Date.now() + WAKE_TIMEOUT_MS;
  let res: Response | null = null;
  for (;;) {
    try {
      res = await fetch(`${BACKEND_URL}${path}`, {
        headers: { Accept: "application/json" },
        // Stock levels must be fresh, so product data is never cached.
        ...(revalidate > 0 ? { next: { revalidate } } : { cache: "no-store" as const }),
      });
      if (!WAKE_STATUSES.has(res.status) || Date.now() > deadline) break;
    } catch {
      if (Date.now() > deadline) throw new BackendError(503, "The catalog service is unreachable.");
    }
    await sleep(3000);
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
