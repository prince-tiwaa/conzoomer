import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductCard } from "@/components/product-card";
import { Body, Button, Display, EmptyState, LoadingView, Notice, Wordmark } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { colors, fonts, radius } from "@/lib/theme";
import type { Category, ProductCard as Product, ProductList } from "@/lib/types";

const SORTS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
];

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const gutter = 16;
  const gap = 14;
  const cardWidth = Math.floor((Math.min(width, 720) - gutter * 2 - gap) / 2);

  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("featured");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "more">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (nextPage: number, mode: "replace" | "append") => {
      const id = ++requestId.current;
      if (mode === "append") setStatus("more");
      const params = new URLSearchParams({ page: String(nextPage), page_size: "12", sort });
      if (category) params.set("category", category);
      if (submittedQuery) params.set("q", submittedQuery);
      try {
        const data = await api<ProductList>(`/api/products/?${params.toString()}`, { auth: false });
        if (id !== requestId.current) return;
        setProducts((prev) => (mode === "append" ? [...prev, ...data.results] : data.results));
        setPage(data.page);
        setNumPages(data.num_pages);
        setCount(data.count);
        setError(null);
        setStatus("ready");
      } catch (e) {
        if (id !== requestId.current) return;
        setError(errorMessage(e, "We couldn't load products."));
        setStatus(mode === "append" ? "ready" : "error");
      }
    },
    [category, sort, submittedQuery],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setStatus("loading");
      load(1, "replace");
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    api<{ results: Category[] }>("/api/categories/", { auth: false })
      .then((d) => setCategories(d.results))
      .catch(() => {});
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(1, "replace");
    setRefreshing(false);
  };

  const header = (
    <View style={{ paddingTop: insets.top + 8, gap: 18, paddingBottom: 18 }}>
      <View style={{ paddingHorizontal: gutter, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Wordmark />
      </View>

      <View style={{ paddingHorizontal: gutter }}>
        <Display style={{ fontSize: 34, lineHeight: 38 }}>
          Everyday things,{"\n"}
          <Text style={{ fontFamily: fonts.displayItalic, color: colors.cobalt }}>chosen with care.</Text>
        </Display>
      </View>

      <View style={{ paddingHorizontal: gutter }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.paper, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, height: 48 }}>
          <Ionicons name="search" size={18} color={colors.inkMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search products"
            placeholderTextColor="#8B8478"
            returnKeyType="search"
            accessibilityLabel="Search products"
            onSubmitEditing={() => setSubmittedQuery(query.trim())}
            style={{ flex: 1, marginLeft: 8, fontFamily: fonts.body, fontSize: 16, color: colors.ink }}
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={10}
              onPress={() => {
                setQuery("");
                setSubmittedQuery("");
              }}
            >
              <Ionicons name="close-circle" size={18} color={colors.inkMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: 8 }}>
        {[{ slug: "", name: "All" }, ...categories].map((c) => {
          const active = category === c.slug;
          return (
            <Pressable
              key={c.slug || "all"}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setCategory(c.slug)}
              style={{ paddingHorizontal: 16, height: 40, borderRadius: radius.pill, justifyContent: "center", backgroundColor: active ? colors.ink : colors.paper, borderWidth: 1, borderColor: active ? colors.ink : colors.lineStrong }}
            >
              <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: active ? colors.ivory : colors.ink }}>{c.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ paddingHorizontal: gutter, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Body muted accessibilityLiveRegion="polite">{status === "loading" ? "Loading…" : `${count} ${count === 1 ? "product" : "products"}`}</Body>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {SORTS.map((s) => (
            <Pressable
              key={s.value}
              accessibilityRole="button"
              accessibilityLabel={`Sort by ${s.label}`}
              accessibilityState={{ selected: sort === s.value }}
              onPress={() => setSort(s.value)}
              style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: sort === s.value ? colors.cobaltWash : "transparent" }}
            >
              <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: sort === s.value ? colors.cobaltDeep : colors.inkMuted }}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {error && status === "ready" ? <Notice tone="error" style={{ marginHorizontal: gutter }}>{error}</Notice> : null}
    </View>
  );

  return (
    <FlatList
      data={status === "loading" || status === "error" ? [] : products}
      keyExtractor={(p) => String(p.id)}
      numColumns={2}
      columnWrapperStyle={{ gap, paddingHorizontal: gutter }}
      contentContainerStyle={{ gap: 24, paddingBottom: 32 }}
      ListHeaderComponent={header}
      renderItem={({ item }) => <ProductCard product={item} width={cardWidth} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.cobalt} colors={[colors.cobalt]} />}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (status === "ready" && page < numPages) load(page + 1, "append");
      }}
      ListEmptyComponent={
        status === "loading" ? (
          <View style={{ height: 320 }}><LoadingView label="Loading products…" /></View>
        ) : status === "error" ? (
          <EmptyState icon="cloud-offline-outline" title="We couldn't load products" body={error ?? undefined} action={<Button title="Try again" onPress={() => { setStatus("loading"); load(1, "replace"); }} />} />
        ) : (
          <EmptyState
            icon="search-outline"
            title="No products match"
            body="Try a different search or category."
            action={<Button title="Clear filters" variant="outline" onPress={() => { setQuery(""); setSubmittedQuery(""); setCategory(""); }} />}
          />
        )
      }
      ListFooterComponent={status === "more" ? <View style={{ height: 80 }}><LoadingView label="Loading more…" /></View> : null}
      keyboardShouldPersistTaps="handled"
    />
  );
}
