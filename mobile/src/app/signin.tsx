import { router } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";

import { AuthForm } from "@/components/auth-form";

export default function SignInScreen() {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <AuthForm
          intro="Sign in to add items to your cart. It's the same cart you see on the Conzoomer website."
          onSuccess={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
