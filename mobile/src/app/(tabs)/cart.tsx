import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Body, Button, Display, EmptyState, LoadingView, Notice, ProductImage, QuantityStepper, Row, styles } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { formatMoney, plural } from "@/lib/format";
import { colors, fonts } from "@/lib/theme";
import type { CartLine } from "@/lib/types";

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const { cart, loading, error, refresh, update, remove } = useCart();
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [lineError, setLineError] = useState<{ id: number; message: string } | null>(null);

  // Always show the latest cart (it may have changed on the website).
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const mutate = async (id: number, fn: () => Promise<unknown>) => {
    setBusy(id);
    setLineError(null);
    try {
      await fn();
    } catch (e) {
      setLineError({ id, message: errorMessage(e) });
      refresh();
    } finally {
      setBusy(null);
    }
  };

  const top = <View style={{ height: insets.top }} />;

  if (status === "loading") return <LoadingView />;
  if (status === "signedOut") {
    return (
      <View style={{ flex: 1 }}>
        {top}
        <EmptyState
          icon="bag-outline"
          title="Sign in to see your cart"
          body="Your cart is saved to your account, so it's the same here and on the Conzoomer website."
          action={<Button title="Sign in or create account" onPress={() => router.push("/signin")} size="lg" />}
        />
      </View>
    );
  }
  if (!cart) {
    return error ? (
      <View style={{ flex: 1 }}>
        {top}
        <EmptyState icon="cloud-offline-outline" title="We couldn't load your cart" body={errorMessage(error)} action={<Button title="Try again" onPress={refresh} />} />
      </View>
    ) : (
      <LoadingView label="Loading your cart…" />
    );
  }

  const c = cart.currency;
  const threshold = Number(cart.free_shipping_threshold);
  const remaining = threshold - Number(cart.subtotal);

  const renderItem = ({ item }: { item: CartLine }) => (
    <View style={{ flexDirection: "row", gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.line, opacity: busy === item.id ? 0.6 : 1 }}>
      <Pressable onPress={() => router.push({ pathname: "/product/[slug]", params: { slug: item.product.slug } })} accessibilityLabel={`Open ${item.product.name}`} accessibilityRole="link">
        <ProductImage uri={item.product.image?.url} width={92} rounded={14} label={item.product.category} />
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }} numberOfLines={2}>{item.product.name}</Text>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{formatMoney(item.line_total, c)}</Text>
        </View>
        <Body muted style={{ fontSize: 13 }}>{formatMoney(item.unit_price, c)} each</Body>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
          <QuantityStepper
            small
            value={item.quantity}
            max={Math.max(item.product.max_quantity, item.quantity)}
            disabled={busy !== null}
            label={`Quantity for ${item.product.name}`}
            onChange={(q) => mutate(item.id, () => update(item.id, q))}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.product.name}`}
            disabled={busy !== null}
            onPress={() => mutate(item.id, () => remove(item.id))}
            hitSlop={8}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, padding: 8 }}
          >
            <Ionicons name="trash-outline" size={16} color={colors.inkMuted} />
            <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.inkMuted }}>Remove</Text>
          </Pressable>
        </View>
        {lineError?.id === item.id ? <Text style={styles.error}>{lineError.message}</Text> : null}
      </View>
    </View>
  );

  return (
    <FlatList
      data={cart.items}
      keyExtractor={(i) => String(i.id)}
      renderItem={renderItem}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 32, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.cobalt} colors={[colors.cobalt]} />}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
          <Display>Your cart</Display>
          <Body muted accessibilityLiveRegion="polite">
            {plural(cart.item_count, "item")} · synced with your account{loading ? " · updating…" : ""}
          </Body>
          {cart.notices.map((n, i) => (
            <Notice key={i} tone="warn">{n.message}</Notice>
          ))}
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="bag-outline"
          title="Your cart is empty"
          body="Items you add here or on the Conzoomer website show up in both places."
          action={<Button title="Start shopping" onPress={() => router.navigate("/")} />}
        />
      }
      ListFooterComponent={
        cart.items.length ? (
          <View style={[styles.card, { padding: 18, marginTop: 20, gap: 6 }]}>
            {threshold > 0 ? (
              <Body style={{ fontSize: 14, marginBottom: 6 }}>
                {remaining > 0 ? `Add ${formatMoney(remaining, c)} more for free standard shipping.` : "You've unlocked free standard shipping."}
              </Body>
            ) : null}
            <Row label="Subtotal" value={formatMoney(cart.estimate.subtotal, c)} />
            <Row label="Standard shipping" value={Number(cart.estimate.shipping_total) === 0 ? "Free" : formatMoney(cart.estimate.shipping_total, c)} />
            <Row label={cart.estimate.tax_label} value={formatMoney(cart.estimate.tax_total, c)} />
            <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 6 }} />
            <Row label="Estimated total" value={formatMoney(cart.estimate.total, c)} strong />
            <Button title="Checkout" icon="arrow-forward" size="lg" style={{ marginTop: 12 }} onPress={() => router.push("/checkout")} />
          </View>
        ) : null
      }
    />
  );
}
