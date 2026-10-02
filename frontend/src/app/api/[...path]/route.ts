import { proxy } from "@/lib/proxy";

// Forwarded to Django (see src/lib/proxy.ts).
export const dynamic = "force-dynamic";
export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as HEAD, proxy as OPTIONS };
