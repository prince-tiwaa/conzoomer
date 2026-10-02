"use client";

import type { ApiErrorBody } from "./types";

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody;
  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.body = body;
  }
  get code() {
    return this.body.code;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((row) => row.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

export function csrfToken(): string {
  return readCookie("csrftoken") || "";
}

let csrfPromise: Promise<unknown> | null = null;
async function ensureCsrf() {
  if (csrfToken()) return;
  csrfPromise ??= fetch("/api/session/", { credentials: "same-origin" }).finally(() => {
    csrfPromise = null;
  });
  await csrfPromise;
}

type Options = { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal };

/** Same-origin JSON fetch to the Django API with CSRF and consistent errors. */
export async function api<T>(path: string, { method = "GET", body, headers = {}, signal }: Options = {}): Promise<T> {
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method);
  if (unsafe) await ensureCsrf();
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      signal,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(unsafe ? { "X-CSRFToken": csrfToken() } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(0, {
      code: "network_error",
      message: "We couldn't reach the store. Check your connection and try again.",
    });
  }
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const err = (data as { error?: ApiErrorBody } | null)?.error;
    throw new ApiError(
      response.status,
      err ?? {
        code: response.status >= 500 ? "server_error" : "error",
        message:
          response.status >= 500
            ? "The store is having trouble right now. Please try again in a moment."
            : "Something went wrong. Please try again.",
      },
    );
  }
  return data as T;
}
