import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { api, ApiError, randomString, setAuthToken, setUnauthorizedHandler } from "./api";
import { WEB_URL } from "./config";
import { storage } from "./storage";
import type { User } from "./types";

const TOKEN_KEY = "conzoomer.token";
const USER_KEY = "conzoomer.user";

type Status = "loading" | "signedOut" | "signedIn";

interface AuthValue {
  status: Status;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<"success" | "cancelled">;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

const GOOGLE_ERRORS: Record<string, string> = {
  cancelled: "Google sign-in was cancelled.",
  email_exists: "An account with that email already exists. Sign in with your email and password instead.",
  google_not_configured: "Google sign-in isn't available right now. Use your email and password.",
  provider: "Google sign-in didn't complete. Please try again.",
  not_signed_in: "Google sign-in didn't complete. Please try again.",
};

function toBase64Url(b64: string) {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const mounted = useRef(true);

  const clear = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    setStatus("signedOut");
    await Promise.all([storage.remove(TOKEN_KEY), storage.remove(USER_KEY)]);
  }, []);

  const accept = useCallback(async (token: string, u: User) => {
    setAuthToken(token);
    await Promise.all([storage.set(TOKEN_KEY, token), storage.set(USER_KEY, JSON.stringify(u))]);
    setUser(u);
    setStatus("signedIn");
  }, []);

  // Restore the saved session, then confirm it with the server.
  useEffect(() => {
    mounted.current = true;
    setUnauthorizedHandler(() => {
      clear();
    });
    (async () => {
      const [token, cached] = await Promise.all([storage.get(TOKEN_KEY), storage.get(USER_KEY)]);
      if (!token) {
        setStatus("signedOut");
        return;
      }
      setAuthToken(token);
      if (cached) {
        try {
          setUser(JSON.parse(cached));
        } catch {}
      }
      setStatus("signedIn");
      try {
        const me = await api<{ user: User }>("/api/account/");
        if (mounted.current) {
          setUser(me.user);
          storage.set(USER_KEY, JSON.stringify(me.user));
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) clear();
        // Offline or server waking up: keep the saved session.
      }
    })();
    return () => {
      mounted.current = false;
      setUnauthorizedHandler(null);
    };
  }, [clear]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const r = await api<{ token: string; user: User }>("/api/mobile/auth/login/", {
        method: "POST",
        auth: false,
        body: { email: email.trim(), password },
      });
      await accept(r.token, r.user);
    },
    [accept],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const r = await api<{ token: string; user: User }>("/api/mobile/auth/register/", {
        method: "POST",
        auth: false,
        body: { name: name.trim(), email: email.trim(), password },
      });
      await accept(r.token, r.user);
    },
    [accept],
  );

  /** Google sign-in in the system browser on the website's domain, then a
   *  one-time code (bound to a PKCE verifier) is exchanged for an app token. */
  const signInWithGoogle = useCallback(async () => {
    const verifier = randomString(Crypto.getRandomBytes(64));
    const challenge = toBase64Url(
      await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 }),
    );
    const state = randomString(Crypto.getRandomBytes(24));
    const redirectUri = Linking.createURL("auth");
    const startUrl =
      `${WEB_URL}/api/mobile/google/start/?redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&code_challenge=${challenge}&state=${state}`;

    const result = await WebBrowser.openAuthSessionAsync(startUrl, redirectUri);
    if (result.type !== "success") return "cancelled";

    const params = (Linking.parse(result.url).queryParams ?? {}) as Record<string, string | undefined>;
    if (params.state !== state) throw new ApiError(400, { code: "state_mismatch", message: "Sign-in couldn't be verified. Please try again." });
    if (params.error) {
      if (params.error === "cancelled") return "cancelled";
      throw new ApiError(400, { code: params.error, message: GOOGLE_ERRORS[params.error] ?? GOOGLE_ERRORS.provider });
    }
    if (!params.code) throw new ApiError(400, { code: "no_code", message: GOOGLE_ERRORS.provider });

    const r = await api<{ token: string; user: User }>("/api/mobile/google/exchange/", {
      method: "POST",
      auth: false,
      body: { code: params.code, code_verifier: verifier },
    });
    await accept(r.token, r.user);
    return "success";
  }, [accept]);

  const signOut = useCallback(async () => {
    try {
      await api("/api/mobile/auth/logout/", { method: "POST" });
    } catch {
      // Signing out locally still matters if the server can't be reached.
    }
    await clear();
  }, [clear]);

  const value = useMemo(
    () => ({ status, user, signIn, register, signInWithGoogle, signOut }),
    [status, user, signIn, register, signInWithGoogle, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
