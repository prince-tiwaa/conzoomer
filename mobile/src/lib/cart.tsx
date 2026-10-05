import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

import { api } from "./api";
import { useAuth } from "./auth";
import type { Cart } from "./types";

interface CartValue {
  cart: Cart | null;
  count: number;
  loading: boolean;
  error: unknown;
  refresh: () => Promise<Cart | null>;
  add: (productId: number, quantity: number) => Promise<Cart>;
  update: (itemId: number, quantity: number) => Promise<Cart>;
  remove: (itemId: number) => Promise<Cart>;
}

const CartContext = createContext<CartValue | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

/**
 * The cart lives on the server and belongs to the signed-in account, so it is
 * the same cart the website shows. We re-fetch whenever the app comes back to
 * the foreground (e.g. after adding something on the website).
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const signedIn = status === "signedIn";

  const refresh = useCallback(async () => {
    if (!signedIn) return null;
    setLoading(true);
    try {
      const c = await api<Cart>("/api/cart/");
      setCart(c);
      setError(null);
      return c;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setLoading(false);
    }
  }, [signedIn]);

  // Load the account's cart when signing in.
  useEffect(() => {
    const t = setTimeout(refresh, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  // Re-sync whenever the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const add = useCallback(async (productId: number, quantity: number) => {
    const c = await api<Cart>("/api/cart/items/", { method: "POST", body: { product_id: productId, quantity } });
    setCart(c);
    return c;
  }, []);

  const update = useCallback(async (itemId: number, quantity: number) => {
    const c = await api<Cart>(`/api/cart/items/${itemId}/`, { method: "PATCH", body: { quantity } });
    setCart(c);
    return c;
  }, []);

  const remove = useCallback(async (itemId: number) => {
    const c = await api<Cart>(`/api/cart/items/${itemId}/`, { method: "DELETE" });
    setCart(c);
    return c;
  }, []);

  const value = useMemo(
    () => {
      const current = signedIn ? cart : null; // never show a previous account's cart
      return { cart: current, count: current?.item_count ?? 0, loading, error, refresh, add, update, remove };
    },
    [signedIn, cart, loading, error, refresh, add, update, remove],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
