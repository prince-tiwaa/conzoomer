import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { colors, fonts } from "@/lib/theme";
import type { ProductCard as Product } from "@/lib/types";

import { Price, ProductImage, StockBadge } from "./ui";

export function ProductCard({ product, width }: { product: Product; width: number }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${product.name}, ${product.category.name}`}
      onPress={() => router.push({ pathname: "/product/[slug]", params: { slug: product.slug } })}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.85 : 1 }]}
    >
      <ProductImage uri={product.image?.url} width={width} label={product.category.name} />
      <Text style={{ marginTop: 10, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: colors.inkMuted }}>
        {product.category.name}
      </Text>
      <Text numberOfLines={2} style={{ marginTop: 2, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, color: colors.ink }}>
        {product.name}
      </Text>
      <View style={{ marginTop: 4, gap: 4 }}>
        <Price amount={product.price} currency={product.currency} />
        <StockBadge status={product.stock_status} available={product.available} />
      </View>
    </Pressable>
  );
}
