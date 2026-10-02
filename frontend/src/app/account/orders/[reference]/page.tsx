"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { OrderSkeleton, OrderView } from "@/components/order-view";
import { RequireUser } from "@/components/require-user";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { OrderDetail } from "@/lib/types";

function Detail() {
  const { reference } = useParams<{ reference: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<number | null>(null);

  useEffect(() => {
    api<{ order: OrderDetail }>(`/api/account/orders/${encodeURIComponent(reference)}/`)
      .then((d) => {
        setOrder(d.order);
        document.title = `Order ${d.order.reference} · Conzoomer`;
      })
      .catch((e) => setError(e instanceof ApiError ? e.status : 0));
  }, [reference]);

  if (error !== null) {
    return (
      <div className="container-page py-20 text-center">
        <h1 className="text-4xl font-medium">{error === 404 ? "Order not found" : "Couldn't load this order"}</h1>
        <p className="mt-3 text-ink-soft">{error === 404 ? "It may belong to a different account." : "Please try again in a moment."}</p>
        <Link href="/account" className="btn btn-primary mt-8">Back to your orders</Link>
      </div>
    );
  }
  if (!order) return <OrderSkeleton />;
  return (
    <div className="container-page py-10 lg:py-14">
      <Link href="/account" className="text-sm font-medium text-ink-muted hover:text-ink hover:underline">← All orders</Link>
      <h1 className="mt-3 text-4xl font-medium sm:text-5xl">Order <span className="font-mono text-[0.8em]">{order.reference}</span></h1>
      <p className="mt-3 text-ink-soft">Placed {formatDate(order.placed_at)} · {order.status_label} · <span className="font-medium text-cobalt-deep">{order.payment_status_label}</span></p>
      <div className="mt-10"><OrderView order={order} /></div>
    </div>
  );
}

export default function AccountOrderPage() {
  return (
    <RequireUser next="/account">
      <Detail />
    </RequireUser>
  );
}
