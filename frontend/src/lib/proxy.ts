import "server-only";

import type { NextRequest } from "next/server";

/**
 * Same-origin proxy to Django for /api, /accounts, /admin and /static.
 *
 * Shoppers only ever talk to the storefront's origin, so session and CSRF
 * cookies are first-party. We forward explicitly (instead of next.config
 * rewrites) so the backend receives its *own* Host header — hosts such as
 * Render route requests by Host — while the public host travels in
 * X-Forwarded-Host for Django to build correct URLs (e.g. the Google callback).
 */
const BACKEND_URL = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

if (process.env.NODE_ENV === "production" && !process.env.BACKEND_URL) {
  console.warn("[conzoomer] BACKEND_URL is not set; proxying to http://127.0.0.1:8000");
}

const DROP_REQUEST = new Set([
  "host", "connection", "content-length", "accept-encoding", "keep-alive",
  "transfer-encoding", "upgrade", "proxy-connection", "te", "trailer", "expect",
]);
const DROP_RESPONSE = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive", "set-cookie"]);

export async function proxy(req: NextRequest): Promise<Response> {
  const incoming = new URL(req.url);
  const target = `${BACKEND_URL}${incoming.pathname}${incoming.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!DROP_REQUEST.has(key.toLowerCase())) headers.set(key, value);
  });
  const publicHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || incoming.host;
  const publicProto = req.headers.get("x-forwarded-proto") || incoming.protocol.replace(":", "");
  headers.set("x-forwarded-host", publicHost.split(",")[0].trim());
  headers.set("x-forwarded-proto", publicProto.split(",")[0].trim());

  const hasBody = !["GET", "HEAD"].includes(req.method);
  const body = hasBody ? await req.arrayBuffer() : undefined;
  // Free hosting sleeps the API when idle and answers 502/503 while it wakes.
  // Safe (read-only) requests wait for it, for up to a minute.
  const deadline = Date.now() + (hasBody ? 0 : 60_000);
  let upstream: Response | null = null;
  for (;;) {
    try {
      upstream = await fetch(target, { method: req.method, headers, body, redirect: "manual", cache: "no-store" });
      if (![502, 503, 504].includes(upstream.status) || Date.now() > deadline) break;
    } catch (error) {
      if (Date.now() > deadline) {
        console.error("[conzoomer] backend unreachable:", target, error);
        return Response.json(
          { error: { code: "backend_unavailable", message: "The store is waking up or temporarily unavailable. Please try again in a moment." } },
          { status: 502 },
        );
      }
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!DROP_RESPONSE.has(key.toLowerCase())) out.set(key, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) out.append("set-cookie", cookie);

  return new Response(req.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}
