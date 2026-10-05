import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { useCart } from "@/lib/cart";
import { colors, fonts } from "@/lib/theme";

export default function TabsLayout() {
  const { count } = useCart();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.cobalt,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: { backgroundColor: colors.paper, borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
        sceneStyle: { backgroundColor: colors.ivory },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Shop",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "storefront" : "storefront-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Cart",
          tabBarBadge: count > 0 ? count : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.cobalt, color: colors.white, fontFamily: fonts.semibold, fontSize: 11 },
          tabBarAccessibilityLabel: `Cart, ${count} ${count === 1 ? "item" : "items"}`,
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "bag" : "bag-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
