"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";

import { EmailStatus, OrderSkeleton, OrderView } from "@/components/order-view";
import { useSession } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { OrderDetail } from "@/lib/types";

function Confirmation() {
  const { reference } = useParams<{ reference: string }>();
  const params = useSearchParams();
  const token = params.get("token");
  const justPlaced = params.get("placed") === "1";
  const { session } = useSession();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    const q = token ? `?token=${encodeURIComponent(token)}` : "";
    api<{ order: OrderDetail }>(`/api/orders/${encodeURIComponent(reference)}/${q}`)
      .then((d) => {
        if (cancelled) return;
        setOrder(d.order);
        document.title = `Order ${d.order.reference} · Conzoomer`;
        window.requestAnimationFrame(() => heading.current?.focus());
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError ? { status: e.status, message: e.message } : { status: 0, message: "Couldn't load this order." }));
    return () => {
      cancelled = true;
    };
  }, [reference, token]);

  if (error) {
    return (
      <div className="container-page py-20">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="text-4xl font-medium">{error.status === 404 ? "We couldn't find that order" : "Something went wrong"}</h1>
          <p className="mt-3 text-ink-soft">
            {error.status === 404
              ? "Check the link in your confirmation email, or sign in to see orders placed with your account."
              : error.message}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/account" className="btn btn-primary">Your orders</Link>
            <Link href="/shop" className="btn btn-outline">Continue shopping</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!order) return <OrderSkeleton />;

  const previewHref = `/api/orders/${order.reference}/email-preview/${token ? `?token=${encodeURIComponent(token)}` : ""}`;

  return (
    <div className="container-page py-10 lg:py-14">
      <div className="animate-rise max-w-3xl">
        <p className="inline-flex items-center gap-2 font-semibold text-success">
          <CheckCircle2 className="size-5" aria-hidden /> {justPlaced ? "Order placed" : "Order confirmed"}
        </p>
        <h1 ref={heading} tabIndex={-1} className="mt-3 text-4xl font-medium focus:outline-none sm:text-5xl">
          {justPlaced ? `Thank you, ${order.shipping_address.full_name.split(" ")[0]}.` : `Order ${order.reference}`}
        </h1>
        <p className="mt-4 text-lg text-ink-soft">
          Order reference <strong className="font-mono text-ink">{order.reference}</strong> · placed {formatDate(order.placed_at)}
        </p>
        <div className="mt-6 rounded-2xl border border-cobalt/20 bg-cobalt-wash p-4 text-sm text-cobalt-deep">
          <strong>Demo order — not charged.</strong> Your order is saved in our system, but this is a demonstration store: no payment was taken and nothing will ship.
        </div>
        <div className="mt-3">
          <EmailStatus order={order} previewHref={previewHref} />
        </div>
      </div>

      <div className="mt-12">
        <OrderView order={order} />
      </div>

      <div className="mt-12 flex flex-wrap gap-3 border-t border-line pt-8">
        <Link href="/shop" className="btn btn-primary btn-lg">Continue shopping</Link>
        {session?.user ? (
          <Link href="/account" className="btn btn-outline btn-lg">View all your orders</Link>
        ) : session?.google_enabled ? (
          <Link href="/signin?next=/account" className="btn btn-outline btn-lg">Sign in to track future orders</Link>
        ) : null}
      </div>
    </div>
  );
}

export default function OrderPage() {
  return (
    <Suspense fallback={<OrderSkeleton />}>
      <Confirmation />
    </Suspense>
  );
}
