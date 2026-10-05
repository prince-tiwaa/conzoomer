import { API_URL } from "./config";
import type { ApiErrorBody } from "./types";

export class ApiError extends Error {
  constructor(public status: number, public body: ApiErrorBody) {
    super(body.message);
  }
  get code() {
    return this.body.code;
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

type Options = { method?: string; body?: unknown; headers?: Record<string, string>; auth?: boolean };

/** JSON request to the Conzoomer API with the signed-in user's token. */
export async function api<T>(path: string, { method = "GET", body, headers = {}, auth = true }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(auth && authToken ? { Authorization: `Token ${authToken}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, {
      code: "network_error",
      message: "Can't reach Conzoomer. Check your connection and try again.",
    });
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && auth && authToken) onUnauthorized?.();
    const err = (data as { error?: ApiErrorBody } | null)?.error;
    throw new ApiError(
      res.status,
      err ?? {
        code: res.status >= 500 ? "server_error" : "error",
        message: res.status >= 500 ? "The store is having trouble right now. Please try again shortly." : "Something went wrong. Please try again.",
      },
    );
  }
  return data as T;
}

export function errorMessage(e: unknown, fallback = "Something went wrong. Please try again."): string {
  return e instanceof ApiError ? e.message : fallback;
}

/** Random URL-safe string (idempotency keys, PKCE verifiers, OAuth state). */
export function randomString(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  for (const b of bytes) out += alphabet[b & 63];
  return out;
}
