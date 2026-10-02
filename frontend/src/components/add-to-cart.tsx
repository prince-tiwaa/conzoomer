"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Loader2, ShoppingBag } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { Cart } from "@/lib/types";

import { useFeedback, useSession } from "./providers";
import { QuantityStepper } from "./quantity-stepper";

export function AddToCart({ productId, productName, maxQuantity }: { productId: number; productName: string; maxQuantity: number }) {
  const { setCartCount } = useSession();
  const { toast, announce } = useFeedback();
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState<"idle" | "pending" | "added">("idle");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const soldOut = maxQuantity <= 0;

  const add = async () => {
    if (state === "pending" || soldOut) return;
    setState("pending");
    setError(null);
    try {
      const cart = await api<Cart>("/api/cart/items/", { method: "POST", body: { product_id: productId, quantity } });
      setCartCount(cart.item_count);
      setAdded(quantity);
      setState("added");
      toast({ tone: "success", title: `Added ${quantity} × ${productName} to your cart`, action: { href: "/cart", label: "View cart" } });
      window.setTimeout(() => setState((s) => (s === "added" ? "idle" : s)), 2400);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Couldn't add to cart. Please try again.";
      setError(message);
      announce(message);
      setState("idle");
    }
  };

  if (soldOut) {
    return (
      <div className="mt-8">
        <button type="button" className="btn btn-dark btn-lg w-full" disabled aria-disabled="true">
          Sold out
        </button>
        <p className="mt-3 text-sm text-ink-muted">This item is currently out of stock. <Link href="/shop?in_stock=1" className="link">See what&apos;s available</Link>.</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-3">
        <QuantityStepper value={quantity} max={maxQuantity} onChange={setQuantity} label="Quantity" disabled={state === "pending"} />
        <button
          type="button"
          onClick={add}
          disabled={state === "pending"}
          className="btn btn-primary btn-lg min-w-0 flex-1"
          aria-describedby={error ? "add-error" : undefined}
        >
          {state === "pending" ? (
            <><Loader2 className="size-5 animate-spin" aria-hidden /> Adding…</>
          ) : state === "added" ? (
            <><Check className="size-5" aria-hidden /> Added to cart</>
          ) : (
            <><ShoppingBag className="size-5" aria-hidden /> Add to cart</>
          )}
        </button>
      </div>
      <p className="mt-2 text-sm text-ink-muted">Up to {maxQuantity} per order.</p>
      {error && (
        <p id="add-error" role="alert" className="mt-3 rounded-xl bg-danger-wash px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {added && !error && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-success/25 bg-success-wash px-4 py-3">
          <p className="text-sm font-medium text-success">
            <Check className="mr-1.5 inline size-4" aria-hidden />
            {added} added to your cart.
          </p>
          <div className="flex gap-2">
            <Link href="/cart" className="btn btn-outline !min-h-9 !px-4 text-sm">View cart</Link>
            <Link href="/checkout" className="btn btn-dark !min-h-9 !px-4 text-sm">Checkout</Link>
          </div>
        </div>
      )}
    </div>
  );
}
