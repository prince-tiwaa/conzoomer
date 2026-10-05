import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductCard } from "@/components/product-card";
import { Body, Button, Display, Divider, EmptyState, Eyebrow, LoadingView, Notice, Price, ProductImage, QuantityStepper, StockBadge } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { colors, fonts } from "@/lib/theme";
import type { ProductCard as Product, ProductDetail } from "@/lib/types";

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  // Keyed by slug so moving to a related product starts with fresh state.
  return <ProductView key={slug} slug={slug} />;
}

function ProductView({ slug }: { slug: string }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { status } = useAuth();
  const { add } = useCart();
  const [data, setData] = useState<{ product: ProductDetail; related: Product[] } | null>(null);
  const [loadError, setLoadError] = useState<{ status: number; message: string } | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    api<{ product: ProductDetail; related: Product[] }>(`/api/products/${encodeURIComponent(slug)}/`, { auth: false })
      .then(setData)
      .catch((e) => setLoadError({ status: e instanceof ApiError ? e.status : 0, message: errorMessage(e, "We couldn't load this product.") }));
  }, [slug]);

  if (loadError) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title={loadError.status === 404 ? "Product not found" : "Something went wrong"}
        body={loadError.status === 404 ? "It may no longer be available." : loadError.message}
        action={<Button title="Back to shop" onPress={() => router.navigate("/")} />}
      />
    );
  }
  if (!data) return <LoadingView label="Loading product…" />;

  const { product, related } = data;
  const soldOut = product.max_quantity <= 0;
  const images = product.images.length ? product.images : [{ url: "", alt: product.name }];
  const pageWidth = width;
  const relatedWidth = Math.floor((width - 16 * 2 - 14) / 2);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setImageIndex(Math.round(e.nativeEvent.contentOffset.x / pageWidth));
  };

  const addToCart = async () => {
    if (status !== "signedIn") {
      router.push("/signin");
      return;
    }
    setAdding(true);
    setFeedback(null);
    try {
      await add(product.id, quantity);
      setFeedback({ tone: "success", text: `Added ${quantity} × ${product.name} to your cart.` });
    } catch (e) {
      setFeedback({ tone: "error", text: errorMessage(e, "Couldn't add to cart. Please try again.") });
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: product.name }} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} accessibilityLabel="Product images">
          {images.map((img, i) => (
            <View key={img.url + i} style={{ width: pageWidth, paddingHorizontal: 16 }}>
              <ProductImage uri={img.url || null} width={pageWidth - 32} label={product.category.name} ratio={1.15} />
            </View>
          ))}
        </ScrollView>
        {images.length > 1 ? (
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 12 }} accessibilityLabel={`Image ${imageIndex + 1} of ${images.length}`}>
            {images.map((_, i) => (
              <View key={i} style={{ width: i === imageIndex ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === imageIndex ? colors.ink : colors.lineStrong }} />
            ))}
          </View>
        ) : null}

        <View style={{ paddingHorizontal: 16, marginTop: 20, gap: 12 }}>
          <Eyebrow>{product.category.name}</Eyebrow>
          <Display style={{ fontSize: 32, lineHeight: 36 }}>{product.name}</Display>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Price amount={product.price} currency={product.currency} style={{ fontSize: 22 }} />
            <StockBadge status={product.stock_status} available={product.available} />
          </View>
          <Body style={{ fontSize: 16, lineHeight: 24, color: colors.inkSoft }}>{product.short_description}</Body>

          {soldOut ? (
            <Button title="Sold out" variant="dark" disabled size="lg" style={{ marginTop: 8 }} />
          ) : (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <QuantityStepper value={quantity} max={product.max_quantity} onChange={setQuantity} disabled={adding} />
              <Button
                title={status === "signedIn" ? "Add to cart" : "Sign in to add"}
                icon="bag-add-outline"
                onPress={addToCart}
                loading={adding}
                size="lg"
                style={{ flex: 1 }}
              />
            </View>
          )}
          {!soldOut ? <Body muted style={{ fontSize: 13 }}>Up to {product.max_quantity} per order.</Body> : null}
          {feedback ? (
            <Notice tone={feedback.tone}>
              <View style={{ gap: 10 }}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: feedback.tone === "success" ? colors.success : colors.danger }}>{feedback.text}</Text>
                {feedback.tone === "success" ? (
                  <Button title="View cart" variant="outline" size="sm" onPress={() => router.navigate("/cart")} style={{ alignSelf: "flex-start" }} />
                ) : null}
              </View>
            </Notice>
          ) : null}

          <Divider style={{ marginVertical: 12 }} />
          <Display style={{ fontSize: 24 }}>About this product</Display>
          <Body style={{ color: colors.inkSoft, lineHeight: 23 }}>{product.description}</Body>

          {product.details.length ? (
            <View style={{ marginTop: 8 }}>
              {product.details.map((d) => (
                <View key={d.label} style={{ flexDirection: "row", paddingVertical: 12, borderTopWidth: 1, borderColor: colors.line, gap: 12 }}>
                  <Body muted style={{ width: 120 }}>{d.label}</Body>
                  <Body style={{ flex: 1 }}>{d.value}</Body>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {related.length ? (
          <View style={{ marginTop: 28, gap: 16 }}>
            <Display style={{ fontSize: 24, paddingHorizontal: 16 }}>You might also like</Display>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, rowGap: 24, paddingHorizontal: 16 }}>
              {related.slice(0, 4).map((p) => (
                <ProductCard key={p.id} product={p} width={relatedWidth} />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </>
  );
}
