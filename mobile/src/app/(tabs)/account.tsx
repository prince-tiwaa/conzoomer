import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuthForm } from "@/components/auth-form";
import { Body, Button, Display, LoadingView, Notice, styles, Wordmark } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatMoney, plural } from "@/lib/format";
import { colors, fonts } from "@/lib/theme";
import type { OrderSummary } from "@/lib/types";

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { status, user, signOut } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const loadOrders = useCallback(async () => {
    if (status !== "signedIn") return;
    try {
      const d = await api<{ results: OrderSummary[] }>("/api/account/orders/");
      setOrders(d.results);
      setOrdersError(null);
    } catch (e) {
      setOrdersError(errorMessage(e, "We couldn't load your orders."));
    }
  }, [status]);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders]),
  );

  if (status === "loading") return <LoadingView />;

  if (status === "signedOut") {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 48, gap: 24 }} keyboardShouldPersistTaps="handled">
          <Wordmark />
          <AuthForm />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const initial = (user?.first_name || user?.email || "C").charAt(0).toUpperCase();
  const provider = user?.provider === "google" ? "Google" : user?.provider === "email" ? "Email & password" : "Conzoomer account";

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 40, gap: 20 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await loadOrders();
            setRefreshing(false);
          }}
          tintColor={colors.cobalt}
          colors={[colors.cobalt]}
        />
      }
    >
      <Display>Your account</Display>

      <View style={[styles.card, { padding: 18, gap: 16 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={{ width: 56, height: 56, borderRadius: 28 }} />
          ) : (
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.cobalt, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: colors.white, fontFamily: fonts.displaySemi, fontSize: 24 }}>{initial}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 18, color: colors.ink }} numberOfLines={1}>{user?.name}</Text>
            <Body muted numberOfLines={1}>{user?.email}</Body>
          </View>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderColor: colors.line, paddingTop: 12 }}>
          <Body muted>Signed in with</Body>
          <Body style={{ fontFamily: fonts.semibold }}>{provider}</Body>
        </View>
        <Button
          title={signingOut ? "Signing out…" : "Sign out"}
          variant="outline"
          icon="log-out-outline"
          loading={signingOut}
          onPress={async () => {
            setSigningOut(true);
            await signOut();
            setSigningOut(false);
            setOrders(null);
          }}
        />
      </View>

      <View style={{ gap: 12 }}>
        <Display style={{ fontSize: 24 }}>Order history</Display>
        {ordersError ? <Notice tone="error">{ordersError}</Notice> : null}
        {orders === null && !ordersError ? (
          <View style={{ height: 120 }}><LoadingView label="Loading orders…" /></View>
        ) : orders && orders.length === 0 ? (
          <View style={[styles.card, { padding: 20, alignItems: "center", gap: 8 }]}>
            <Ionicons name="cube-outline" size={28} color={colors.inkMuted} />
            <Body muted style={{ textAlign: "center" }}>No orders yet. Orders you place on the app or the website appear here.</Body>
          </View>
        ) : (
          <View style={[styles.card, { overflow: "hidden" }]}>
            {orders?.map((o, i) => (
              <Pressable
                key={o.reference}
                accessibilityRole="link"
                accessibilityLabel={`Order ${o.reference}, ${formatMoney(o.total, o.currency)}`}
                onPress={() => router.push({ pathname: "/order/[reference]", params: { reference: o.reference } })}
                style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderTopWidth: i ? 1 : 0, borderColor: colors.line, backgroundColor: pressed ? colors.ivory : "transparent" })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{o.reference}</Text>
                  <Body muted style={{ fontSize: 13 }}>{formatDate(o.placed_at)} · {plural(o.item_count, "item")} · {o.status_label}</Body>
                </View>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{formatMoney(o.total, o.currency)}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
