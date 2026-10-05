import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Body, Button, Display, EmptyState, Field, LoadingView, Notice, Row, styles } from "@/components/ui";
import { api, ApiError, errorMessage, randomString } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { formatMoney } from "@/lib/format";
import { colors, fonts, radius } from "@/lib/theme";
import type { CheckoutConfig, OrderDetail, Totals } from "@/lib/types";

type Address = { full_name: string; line1: string; line2: string; city: string; region: string; postal_code: string; country: string };
type Errors = Record<string, string>;

const POSTAL_OPTIONAL = new Set(["NG", "IE"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function flatten(fields: Record<string, unknown> | undefined, prefix = ""): Errors {
  const out: Errors = {};
  for (const [k, v] of Object.entries(fields ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) Object.assign(out, flatten(v as Record<string, unknown>, key));
    else out[key] = String(v);
  }
  return out;
}

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const { status, user } = useAuth();
  const { cart, refresh } = useCart();
  const [config, setConfig] = useState<CheckoutConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState<Address>({ full_name: user?.name && user.name !== user.email ? user.name : "", line1: "", line2: "", city: "", region: "", postal_code: "", country: "US" });
  const [method, setMethod] = useState("standard");
  const [totals, setTotals] = useState<Totals | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // One key per checkout attempt: retries after a dropped connection can't create a second order.
  const idempotencyKey = useRef(randomString(Crypto.getRandomBytes(32)));

  useEffect(() => {
    api<CheckoutConfig>("/api/checkout/config/")
      .then((cfg) => {
        setConfig(cfg);
        if (cfg.prefill) {
          setEmail((v) => v || cfg.prefill!.email);
          setAddress((a) => (a.full_name ? a : { ...a, full_name: cfg.prefill!.full_name }));
        }
      })
      .catch((e) => setLoadError(errorMessage(e, "We couldn't load checkout.")));
  }, []);

  const quote = useCallback(async (m: string) => {
    setQuoting(true);
    try {
      const q = await api<{ totals: Totals }>("/api/checkout/quote/", { method: "POST", body: { shipping_method: m } });
      setTotals(q.totals);
    } catch {
      setTotals(null);
    } finally {
      setQuoting(false);
    }
  }, []);

  const itemCount = cart?.item_count;
  useEffect(() => {
    const t = setTimeout(() => quote(method), 0);
    return () => clearTimeout(t);
  }, [method, quote, itemCount]);

  const set = (k: keyof Address) => (v: string) => {
    setAddress((a) => ({ ...a, [k]: v }));
    setErrors((e) => {
      const n = { ...e };
      delete n[`shipping_address.${k}`];
      return n;
    });
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!EMAIL_RE.test(email.trim())) e.email = "Enter a valid email address.";
    if (phone.trim() && !/^[0-9+()\-.\s]{7,30}$/.test(phone.trim())) e.phone = "Enter a valid phone number.";
    if (address.full_name.trim().length < 2) e["shipping_address.full_name"] = "Enter the recipient's full name.";
    if (!address.line1.trim()) e["shipping_address.line1"] = "Enter the street address.";
    if (!address.city.trim()) e["shipping_address.city"] = "Enter the town or city.";
    if (address.country === "US" && !address.region.trim()) e["shipping_address.region"] = "Enter a state.";
    if (!POSTAL_OPTIONAL.has(address.country) && !address.postal_code.trim()) e["shipping_address.postal_code"] = "Enter a postal code.";
    else if (address.country === "US" && address.postal_code.trim() && !/^\d{5}(-\d{4})?$/.test(address.postal_code.trim()))
      e["shipping_address.postal_code"] = "Enter a 5-digit ZIP code.";
    return e;
  };

  const placeOrder = async () => {
    if (submitting) return;
    const e = validate();
    setErrors(e);
    setFormError(Object.keys(e).length ? "Please check the highlighted fields." : null);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    try {
      const r = await api<{ order: OrderDetail }>("/api/checkout/", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey.current },
        body: {
          email: email.trim(),
          phone: phone.trim(),
          shipping_address: { ...address, postal_code: address.postal_code.trim(), region: address.region.trim() },
          billing_same_as_shipping: true,
          shipping_method: method,
          expected_total: totals?.total ?? null,
        },
      });
      await refresh();
      router.replace({ pathname: "/order/[reference]", params: { reference: r.order.reference, placed: "1" } });
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError) {
        if (err.code === "validation_error") setErrors(flatten(err.body.fields));
        if (err.code === "totals_changed" && err.body.totals) setTotals(err.body.totals);
        if (err.code === "insufficient_stock" || err.code === "cart_empty") refresh();
        const extra = err.body.items?.map((i) => i.message).join(" ");
        setFormError(extra ? `${err.message} ${extra}` : err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    }
  };

  if (status !== "signedIn") {
    return <EmptyState icon="lock-closed-outline" title="Sign in to check out" action={<Button title="Sign in" onPress={() => router.push("/signin")} />} />;
  }
  if (loadError) return <EmptyState icon="cloud-offline-outline" title="We couldn't load checkout" body={loadError} action={<Button title="Back to cart" onPress={() => router.back()} />} />;
  if (!config || !cart) return <LoadingView label="Preparing checkout…" />;
  if (!cart.items.length) return <EmptyState icon="bag-outline" title="Your cart is empty" action={<Button title="Start shopping" onPress={() => router.navigate("/")} />} />;

  const c = cart.currency;
  const isUS = address.country === "US";
  const err = (k: string) => errors[`shipping_address.${k}`];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 22 }} keyboardShouldPersistTaps="handled">
        {formError ? <Notice tone="error">{formError}</Notice> : null}

        <View style={{ gap: 14 }}>
          <Display style={{ fontSize: 24 }}>Contact</Display>
          <Field label="Email" value={email} onChangeText={(v) => { setEmail(v); setErrors((e) => ({ ...e, email: "" })); }} error={errors.email || undefined} keyboardType="email-address" autoCapitalize="none" autoComplete="email" hint="Your order confirmation goes here." />
          <Field label="Phone" optional value={phone} onChangeText={setPhone} error={errors.phone || undefined} keyboardType="phone-pad" autoComplete="tel" />
        </View>

        <View style={{ gap: 14 }}>
          <Display style={{ fontSize: 24 }}>Shipping address</Display>
          <Field label="Full name" value={address.full_name} onChangeText={set("full_name")} error={err("full_name")} autoComplete="name" />
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Country</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {config.countries.map((ct) => (
                <Pressable
                  key={ct.code}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: address.country === ct.code }}
                  onPress={() => set("country")(ct.code)}
                  style={{ paddingHorizontal: 12, height: 36, borderRadius: radius.pill, justifyContent: "center", borderWidth: 1, borderColor: address.country === ct.code ? colors.cobalt : colors.lineStrong, backgroundColor: address.country === ct.code ? colors.cobaltWash : colors.paper }}
                >
                  <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: address.country === ct.code ? colors.cobaltDeep : colors.ink }}>{ct.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Field label="Street address" value={address.line1} onChangeText={set("line1")} error={err("line1")} autoComplete="address-line1" />
          <Field label="Apartment, suite, etc." optional value={address.line2} onChangeText={set("line2")} autoComplete="address-line2" />
          <Field label="Town or city" value={address.city} onChangeText={set("city")} error={err("city")} />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label={isUS ? "State" : "State / county"} optional={!isUS} value={address.region} onChangeText={set("region")} error={err("region")} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={isUS ? "ZIP code" : "Postal code"} optional={POSTAL_OPTIONAL.has(address.country)} value={address.postal_code} onChangeText={set("postal_code")} error={err("postal_code")} keyboardType={isUS ? "number-pad" : "default"} autoComplete="postal-code" />
            </View>
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <Display style={{ fontSize: 24 }}>Shipping method</Display>
          {config.shipping_methods.map((m) => {
            const active = method === m.code;
            const price = totals && totals.shipping_method === m.code ? totals.shipping_total : m.price;
            return (
              <Pressable
                key={m.code}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                onPress={() => setMethod(m.code)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 16, borderWidth: active ? 2 : 1, borderColor: active ? colors.cobalt : colors.lineStrong, backgroundColor: colors.paper }}
              >
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: active ? colors.cobalt : colors.lineStrong, alignItems: "center", justifyContent: "center" }}>
                  {active ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.cobalt }} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{m.label}</Text>
                  <Body muted style={{ fontSize: 13 }}>{m.description}</Body>
                </View>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink }}>{Number(price) === 0 ? "Free" : formatMoney(price, c)}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.card, { padding: 16, gap: 4, opacity: quoting ? 0.6 : 1 }]}>
          <Display style={{ fontSize: 22, marginBottom: 6 }}>Order review</Display>
          {cart.items.map((i) => (
            <Row key={i.id} label={`${i.quantity} × ${i.product.name}`} value={formatMoney(i.line_total, c)} />
          ))}
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 6 }} />
          {totals ? (
            <>
              <Row label="Subtotal" value={formatMoney(totals.subtotal, c)} />
              <Row label={`Shipping · ${totals.shipping_method_label}`} value={Number(totals.shipping_total) === 0 ? "Free" : formatMoney(totals.shipping_total, c)} />
              <Row label={totals.tax_label} value={formatMoney(totals.tax_total, c)} />
              <Row label="Total" value={formatMoney(totals.total, c)} strong />
            </>
          ) : (
            <Body muted>Calculating totals…</Body>
          )}
        </View>

        <Button
          title={submitting ? "Placing your order…" : `Place order${totals ? ` · ${formatMoney(totals.total, c)}` : ""}`}
          onPress={placeOrder}
          loading={submitting}
          disabled={submitting || quoting || !totals}
          size="lg"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
