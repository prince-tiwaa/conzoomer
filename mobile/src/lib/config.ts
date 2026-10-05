import Constants from "expo-constants";

type Extra = { apiUrl?: string; webUrl?: string };
const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

function clean(url: string | undefined, fallback: string) {
  return (url || fallback).replace(/\/+$/, "");
}

/** Django API (token-authenticated). Override with EXPO_PUBLIC_API_URL. */
export const API_URL = clean(process.env.EXPO_PUBLIC_API_URL || extra.apiUrl, "https://conzoomer.onrender.com");

/** The storefront website. Google sign-in runs here so the registered
 *  OAuth callback URL matches. Override with EXPO_PUBLIC_WEB_URL. */
export const WEB_URL = clean(process.env.EXPO_PUBLIC_WEB_URL || extra.webUrl, "https://conzoomer-shop.onrender.com");
