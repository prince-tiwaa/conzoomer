import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, fonts, radius } from "@/lib/theme";

import { Body, Button, Display, Field, Notice } from "./ui";

type Mode = "signin" | "register";
type Errors = Partial<Record<"name" | "email" | "password", string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function AuthForm({ onSuccess, intro }: { onSuccess?: () => void; intro?: string }) {
  const { signIn, register, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<"form" | "google" | null>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const isRegister = mode === "register";

  const submit = async () => {
    if (pending) return;
    const e: Errors = {};
    if (isRegister && name.trim().length < 2) e.name = "Enter your name.";
    if (!EMAIL_RE.test(email.trim())) e.email = "Enter a valid email address.";
    if (!password) e.password = isRegister ? "Choose a password." : "Enter your password.";
    else if (isRegister && password.length < 8) e.password = "Use at least 8 characters.";
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;
    setPending("form");
    try {
      if (isRegister) await register(name, email, password);
      else await signIn(email, password);
      onSuccess?.();
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = (err.body.fields ?? {}) as Errors;
        setErrors(fields);
        setFormError(Object.keys(fields).length ? null : err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setPending(null);
    }
  };

  const google = async () => {
    if (pending) return;
    setPending("google");
    setFormError(null);
    try {
      const r = await signInWithGoogle();
      if (r === "success") onSuccess?.();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Google sign-in didn't complete. Please try again.");
    } finally {
      setPending(null);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <View>
        <Display>{isRegister ? "Create your account" : "Sign in"}</Display>
        <Body muted style={{ marginTop: 6 }}>
          {intro ?? "Use the same account as the Conzoomer website — your cart and orders stay in sync."}
        </Body>
      </View>

      <View style={{ flexDirection: "row", backgroundColor: colors.sand, borderRadius: radius.pill, padding: 4 }} accessibilityRole="tablist">
        {(["signin", "register"] as Mode[]).map((m) => (
          <Pressable
            key={m}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === m }}
            onPress={() => {
              setMode(m);
              setErrors({});
              setFormError(null);
            }}
            style={{ flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: mode === m ? colors.paper : "transparent" }}
          >
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: mode === m ? colors.ink : colors.inkMuted }}>
              {m === "signin" ? "Sign in" : "Create account"}
            </Text>
          </Pressable>
        ))}
      </View>

      {formError ? <Notice tone="error">{formError}</Notice> : null}

      {isRegister ? (
        <Field
          label="Full name"
          value={name}
          onChangeText={setName}
          error={errors.name}
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
      ) : null}
      <Field
        ref={emailRef}
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <View>
        <Field
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          hint={isRegister ? "At least 8 characters." : undefined}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete={isRegister ? "new-password" : "current-password"}
          textContentType={isRegister ? "newPassword" : "password"}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Pressable
          onPress={() => setShowPassword((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? "Hide password" : "Show password"}
          hitSlop={10}
          style={{ position: "absolute", right: 14, top: 38 }}
        >
          <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.inkMuted} />
        </Pressable>
      </View>

      <Button title={isRegister ? "Create account" : "Sign in"} onPress={submit} loading={pending === "form"} disabled={!!pending} size="lg" />

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }} importantForAccessibility="no-hide-descendants">
        <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
        <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.inkMuted, letterSpacing: 1.2 }}>OR</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
      </View>

      <Button title="Continue with Google" variant="outline" icon="logo-google" onPress={google} loading={pending === "google"} disabled={!!pending} size="lg" />
    </View>
  );
}
