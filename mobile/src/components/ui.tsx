import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { forwardRef, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { formatMoney } from "@/lib/format";
import { sizedImage } from "@/lib/images";
import { colors, fonts, radius } from "@/lib/theme";
import type { StockStatus } from "@/lib/types";

/* ---------------- Typography ---------------- */

export function Display({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.display, style]} />;
}

export function Body({ style, muted, ...props }: TextProps & { muted?: boolean }) {
  return <Text {...props} style={[styles.body, muted && { color: colors.inkMuted }, style]} />;
}

export function Eyebrow({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.eyebrow, style]} />;
}

export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <Text style={{ fontFamily: fonts.displaySemi, fontSize: size, color: colors.ink, letterSpacing: -0.8 }} accessibilityRole="header">
      conzoomer<Text style={{ color: colors.cobalt }}>.</Text>
    </Text>
  );
}

/* ---------------- Buttons ---------------- */

type Variant = "primary" | "outline" | "dark" | "ghost";

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  style,
  size = "md",
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  title: string;
  variant?: Variant;
  loading?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  style?: StyleProp<ViewStyle>;
  size?: "md" | "lg" | "sm";
}) {
  const isDisabled = disabled || loading;
  const fg = variant === "primary" || variant === "dark" ? colors.white : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === "lg" && { minHeight: 54, paddingHorizontal: 26 },
        size === "sm" && { minHeight: 40, paddingHorizontal: 16 },
        variant === "primary" && { backgroundColor: pressed ? colors.cobaltDeep : colors.cobalt },
        variant === "dark" && { backgroundColor: pressed ? "#000" : colors.ink },
        variant === "outline" && { borderWidth: 1, borderColor: pressed ? colors.ink : colors.lineStrong, backgroundColor: colors.paper },
        variant === "ghost" && { backgroundColor: pressed ? colors.sand : "transparent" },
        isDisabled && { opacity: 0.55 },
        style,
      ]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }, size === "sm" && { fontSize: 14 }]}>{title}</Text>
    </Pressable>
  );
}

/* ---------------- Fields ---------------- */

export const Field = forwardRef<TextInput, TextInputProps & { label: string; error?: string; hint?: string; optional?: boolean }>(
  function Field({ label, error, hint, optional, style, ...props }, ref) {
    const [focused, setFocused] = useState(false);
    return (
      <View style={{ gap: 6 }}>
        <Text style={styles.label}>
          {label}
          {optional ? <Text style={{ fontFamily: fonts.body, color: colors.inkMuted }}> (optional)</Text> : null}
        </Text>
        <TextInput
          ref={ref}
          placeholderTextColor="#8B8478"
          accessibilityLabel={label}
          accessibilityHint={error || hint}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          style={[
            styles.input,
            focused && { borderColor: colors.cobalt, borderWidth: 2, paddingHorizontal: 13 },
            !!error && { borderColor: colors.danger },
            style as StyleProp<TextStyle>,
          ]}
        />
        {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    );
  },
);

/* ---------------- Notices ---------------- */

const toneMap = {
  info: { bg: colors.cobaltWash, fg: colors.cobaltDeep, icon: "information-circle-outline" as const },
  warn: { bg: colors.warnWash, fg: colors.warn, icon: "alert-circle-outline" as const },
  error: { bg: colors.dangerWash, fg: colors.danger, icon: "close-circle-outline" as const },
  success: { bg: colors.successWash, fg: colors.success, icon: "checkmark-circle-outline" as const },
};

export function Notice({ tone = "info", title, children, style }: { tone?: keyof typeof toneMap; title?: string; children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = toneMap[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t.bg }, style]} accessibilityRole={tone === "error" ? "alert" : "summary"} accessibilityLiveRegion="polite">
      <Ionicons name={t.icon} size={20} color={t.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? <Text style={[styles.noticeTitle, { color: t.fg }]}>{title}</Text> : null}
        {typeof children === "string" ? <Text style={[styles.noticeText, { color: t.fg }]}>{children}</Text> : children}
      </View>
    </View>
  );
}

/* ---------------- Commerce bits ---------------- */

export function Price({ amount, currency, style }: { amount: string; currency: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.price, style]}>{formatMoney(amount, currency)}</Text>;
}

export function StockBadge({ status, available }: { status: StockStatus; available?: number | null }) {
  const map = {
    out_of_stock: { color: colors.danger, text: "Sold out" },
    low_stock: { color: colors.warn, text: available ? `Only ${available} left` : "Low stock" },
    in_stock: { color: colors.success, text: "In stock" },
  }[status];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: map.color }} />
      <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: map.color }}>{map.text}</Text>
    </View>
  );
}

export function ProductImage({
  uri,
  width,
  ratio = 1.25,
  label,
  style,
  rounded = radius.card,
}: {
  uri: string | null | undefined;
  width: number;
  ratio?: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
  rounded?: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = sizedImage(uri, Math.min(1200, width * 2), ratio);
  return (
    <View style={[{ aspectRatio: 1 / ratio, borderRadius: rounded, overflow: "hidden", backgroundColor: colors.sand }, style]}>
      {src && !failed ? (
        <Image
          source={{ uri: src }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={180}
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
          <Text style={{ fontFamily: fonts.displaySemi, fontSize: Math.max(20, width / 5), color: colors.cobalt, opacity: 0.8 }}>
            {(label || "C").charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
    </View>
  );
}

export function QuantityStepper({
  value,
  max,
  min = 1,
  onChange,
  disabled,
  small,
  label = "Quantity",
}: {
  value: number;
  max: number;
  min?: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  small?: boolean;
  label?: string;
}) {
  const size = small ? 40 : 48;
  const btn = (icon: "remove" | "add", next: number, can: boolean, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: !can || !!disabled }}
      disabled={!can || disabled}
      onPress={() => onChange(next)}
      hitSlop={4}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" },
        pressed && { backgroundColor: colors.sand },
        (!can || disabled) && { opacity: 0.35 },
      ]}
    >
      <Ionicons name={icon} size={18} color={colors.ink} />
    </Pressable>
  );
  return (
    <View
      accessibilityLabel={`${label}: ${value}`}
      style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.pill, backgroundColor: colors.paper, height: size }}
    >
      {btn("remove", Math.max(min, value - 1), value > min, "Decrease quantity")}
      <Text style={{ minWidth: 28, textAlign: "center", fontFamily: fonts.semibold, fontSize: 16, color: colors.ink }} accessibilityLiveRegion="polite">
        {value}
      </Text>
      {btn("add", Math.min(max, value + 1), value < max, "Increase quantity")}
    </View>
  );
}

/* ---------------- States ---------------- */

/** Spinner that explains Render's cold start if a request takes a while. */
export function LoadingView({ label = "Loading…" }: { label?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={styles.center} accessibilityLabel={label} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.cobalt} size="large" />
      <Body muted style={{ marginTop: 12, textAlign: "center" }}>
        {slow ? "Waking up the store — this can take up to a minute the first time." : label}
      </Body>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.center}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.sand, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={28} color={colors.ink} />
      </View>
      <Display style={{ fontSize: 26, marginTop: 16, textAlign: "center" }}>{title}</Display>
      {body ? <Body muted style={{ marginTop: 8, textAlign: "center", maxWidth: 320 }}>{body}</Body> : null}
      {action ? <View style={{ marginTop: 20, alignSelf: "stretch", alignItems: "center" }}>{action}</View> : null}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.lineStrong }, style]} />;
}

export function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 4 }}>
      <Text style={[styles.body, { color: strong ? colors.ink : colors.inkSoft, flexShrink: 1 }, strong && { fontFamily: fonts.semibold, fontSize: 17 }]}>{label}</Text>
      <Text style={[styles.body, strong && { fontFamily: fonts.semibold, fontSize: 17 }]}>{value}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  display: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: colors.ink, letterSpacing: -0.5 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.ink },
  eyebrow: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase", color: colors.cobalt },
  button: {
    minHeight: 48,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  buttonText: { fontFamily: fonts.semibold, fontSize: 16 },
  label: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.field,
    backgroundColor: colors.paper,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
  error: { fontFamily: fonts.medium, fontSize: 13, color: colors.danger },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted },
  notice: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 16 },
  noticeTitle: { fontFamily: fonts.semibold, fontSize: 14 },
  noticeText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  price: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { backgroundColor: colors.paper, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line },
});
