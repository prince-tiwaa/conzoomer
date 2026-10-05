# Conzoomer mobile app

An Android (and iOS-ready) app for the Conzoomer shop, built with **Expo SDK 57**, **Expo Router** and TypeScript.

It talks to the same Django API as the website. Carts are stored in PostgreSQL against the user's account, so the website and the app always show **one shared cart**:

- Add something on the website, and it appears in the app (the app re-fetches when the Cart tab opens and whenever the app returns to the foreground).
- Add something in the app, and it appears on the website (the website re-fetches when you switch back to its tab).

## Features

- **Shop:** search, category filter, sorting and infinite scroll.
- **Product page:** image carousel, stock levels, quantity limited to stock, add to cart, related products.
- **Cart:** change quantity, remove items, free-shipping progress and an estimated total. Pull to refresh.
- **Checkout:** contact details, address, shipping method and server-calculated totals. Uses an idempotency key, so a retry can't create a second order.
- **Account:** sign in or create an account with email and password, or **Continue with Google**. Shows profile, order history and order details, and lets you sign out.

## How sign-in works

| Method | Website | App |
|---|---|---|
| Email + password | Session cookie: `POST /api/auth/register/`, `POST /api/auth/login/` | API token: `POST /api/mobile/auth/register/`, `POST /api/mobile/auth/login/` |
| Google | allauth OAuth on the website | Opens the website's Google sign-in in the phone's browser, then returns to `conzoomer://auth` with a one-time code. The app exchanges the code plus a PKCE verifier for a token (`/api/mobile/google/exchange/`). |

Both methods use the same user accounts. The token is kept in the phone's encrypted storage (`expo-secure-store`) and is revoked on sign-out.

## Configuration

`app.json → expo.extra`:

| Key | Default | Meaning |
|---|---|---|
| `apiUrl` | `https://conzoomer.onrender.com` | The Django backend |
| `webUrl` | `https://conzoomer-shop.onrender.com` | The website (Google sign-in runs here) |

Both can be overridden at build time with `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_WEB_URL`.

## Run during development

```powershell
cd mobile
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your phone. Email + password sign-in works in Expo Go. Google sign-in also works there: the `exp://` return address is allowed by the backend.

## Build the APK (EAS Build, free)

Do this once:

```powershell
npm install -g eas-cli
eas login            # create a free account at expo.dev if you don't have one
cd mobile
eas init             # links the project to your Expo account (adds a projectId to app.json)
```

Then build:

```powershell
eas build -p android --profile preview
```

- When asked to **generate a new Android keystore**, answer **Yes**. EAS stores it for you.
- The build runs in Expo's cloud and takes about 10–20 minutes. When it finishes you get a link to a page with an **.apk** download and a QR code.
- Install it on your phone: open the link on the phone, download the APK and allow "Install unknown apps" for your browser.

## Checks

```powershell
npm run typecheck
npm run lint
```
