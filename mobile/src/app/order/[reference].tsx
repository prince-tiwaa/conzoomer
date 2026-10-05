import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { Body, Button, Display, EmptyState, LoadingView, Notice, ProductImage, Row, styles } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { colors, fonts } from "@/lib/theme";
import type { OrderDetail } from "@/lib/types";

export default function OrderScreen() {
  const { reference, placed } = useLocalSearchParams<{ reference: string; placed?: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  useEffect(() => {
    api<{ order: OrderDetail }>(`/api/account/orders/${encodeURIComponent(reference)}/`)
      .then((d) => setOrder(d.order))
      .catch((e) => setError({ status: e instanceof ApiError ? e.status : 0, message: errorMessage(e) }));
  }, [reference]);

  if (error) {
    return <EmptyState icon="alert-circle-outline" title={error.status === 404 ? "Order not found" : "Couldn't load this order"} body={error.message} action={<Button title="Back to account" onPress={() => router.navigate("/account")} />} />;
  }
  if (!order) return <LoadingView label="Loading order…" />;
  const c = order.currency;
  const a = order.shipping_address;

  return (
    <>
      <Stack.Screen options={{ title: order.reference, headerBackVisible: !placed }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 18 }}>
        {placed ? (
          <View style={{ gap: 8 }}>
            <Text style={{ fontFamily: fonts.semibold, color: colors.success, fontSize: 15 }}>✓ Order placed</Text>
            <Display>Thank you, {a.full_name.split(" ")[0]}.</Display>
          </View>
        ) : null}
        <Body muted>Order {order.reference} · placed {formatDate(order.placed_at)} · {order.status_label}</Body>
        {placed ? <Notice tone={order.email_delivery.status === "failed" ? "warn" : "success"}>{order.email_delivery.message}</Notice> : null}

        <View style={[styles.card, { padding: 16 }]}>
          {order.items.map((item, i) => (
            <View key={item.id} style={{ flexDirection: "row", gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
              <ProductImage uri={item.image_url || null} width={64} rounded={12} label={item.product_name} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{item.product_name}</Text>
                <Body muted style={{ fontSize: 13 }}>Qty {item.quantity} · {formatMoney(item.unit_price, c)} each</Body>
              </View>
              <Text style={{ fontFamily: fonts.semibold, color: colors.ink }}>{formatMoney(item.line_total, c)}</Text>
            </View>
          ))}
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 8 }} />
          <Row label="Subtotal" value={formatMoney(order.totals.subtotal, c)} />
          <Row label={`Shipping · ${order.shipping_method_label}`} value={Number(order.totals.shipping_total) === 0 ? "Free" : formatMoney(order.totals.shipping_total, c)} />
          <Row label={`Tax (${(Number(order.totals.tax_rate) * 100).toFixed(1).replace(/\.0$/, "")}%)`} value={formatMoney(order.totals.tax_total, c)} />
          <Row label="Total" value={formatMoney(order.totals.total, c)} strong />
          <Row label="Payment" value={order.payment_status_label} />
        </View>

        <View style={[styles.card, { padding: 16, gap: 4 }]}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2, color: colors.inkMuted }}>SHIPPING TO</Text>
          <Body>{a.full_name}</Body>
          <Body>{a.line1}</Body>
          {a.line2 ? <Body>{a.line2}</Body> : null}
          <Body>{[a.city, a.region, a.postal_code].filter(Boolean).join(", ")}</Body>
          <Body>{a.country_name ?? a.country}</Body>
        </View>

        {placed ? <Button title="Continue shopping" size="lg" onPress={() => router.navigate("/")} /> : null}
      </ScrollView>
    </>
  );
}
