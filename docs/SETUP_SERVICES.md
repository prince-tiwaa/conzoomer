# Setting up Neon, Google sign-in and Mailgun

Each service is optional for a first local run, except the database. Conzoomer keeps working without the other two: the Google button is replaced by a setup note, and emails are saved as local previews.

---

## 1. Neon PostgreSQL (required)

1. Sign in at https://console.neon.tech and click **New project**. Pick a region close to where you'll deploy the backend.
2. On the project dashboard, click **Connect**. Pick your branch (`main`), the database (`neondb`, or create `conzoomer`) and the role.
3. Copy the connection string. It looks like
   `postgresql://USER:PASSWORD@ep-xxxx-xxxx.REGION.aws.neon.tech/neondb?sslmode=require`
   - Use the **direct** (non-pooled) string. The pooled host contains `-pooler`; it works for the app, but the direct one is simplest for migrations and tests.
   - Keep `sslmode=require`.
4. Put it in `backend/.env` as `DATABASE_URL=...`.
5. Run:
   ```
   python manage.py migrate
   python manage.py seed_catalog
   ```
6. Check that the data is there. In the Neon **Tables** view, look at `catalog_product`, `orders_order`, `orders_orderitem` and `notifications_emailmessage`. You can also use `/admin`.

**Supabase instead:** go to Project Settings → Database → Connection string → URI, choose the "Session" pooler or a direct connection, and add `?sslmode=require`. Everything else is the same.

---

## 2. Google sign-in (Google Cloud Console)

Conzoomer uses **django-allauth**. Django handles the whole OAuth flow (state, PKCE and the code exchange), so the client secret never leaves the backend. Google access tokens are not stored (`SOCIALACCOUNT_STORE_TOKENS = False`).

### 2.1 Create or select a project
1. Go to https://console.cloud.google.com/.
2. Use the project picker at the top → **New project** → name it `Conzoomer` → **Create**. Make sure it's selected.

### 2.2 Configure the OAuth consent screen ("Google Auth Platform")
1. Open the menu → **APIs & Services → OAuth consent screen**. In newer consoles this opens **Google Auth Platform**. Click **Get started**.
2. **App information:** App name `Conzoomer`, a user support email, then **Next**.
3. **Audience:** choose **External**, then **Next**.
4. **Contact information:** your email, then **Next**. Agree to the policy and click **Create**.
5. **Data access** (scopes) is optional here. Allauth requests `openid`, `email` and `profile`, which are non-sensitive and need no verification.

### 2.3 Add test users
While the app's publishing status is **Testing**, only listed test users can sign in.
- Go to **Audience → Test users → Add users**, and add the Google accounts you'll demo with (yours, and your lecturer's if they'll try it).
- To let anyone sign in, click **Publish app**. Basic scopes don't need Google verification, but users may see an "unverified app" notice until it's verified.

### 2.4 Create the OAuth client
1. Go to **Clients** (or **APIs & Services → Credentials → Create credentials → OAuth client ID**).
2. Set **Application type** to **Web application** and **Name** to `Conzoomer web`.
3. **Authorized JavaScript origins:**
   - `http://localhost:3000`
   - `https://YOUR-STOREFRONT-DOMAIN` (e.g. `https://conzoomer.vercel.app`)
4. **Authorized redirect URIs.** These must match exactly, including the trailing slash:
   - `http://localhost:3000/accounts/google/login/callback/`
   - `https://YOUR-STOREFRONT-DOMAIN/accounts/google/login/callback/`
5. Click **Create** and copy the **Client ID** and **Client secret**.

> The callback uses the storefront's origin (port 3000), not Django's port 8000. Next.js forwards `/accounts/*` to Django, and Django builds the callback URL from the forwarded host.

### 2.5 Environment variables
In `backend/.env`:
```
GOOGLE_OAUTH_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-...
```
Restart `runserver`. You don't need to create a `SocialApp` in the admin, because the credentials are read from settings.

### 2.6 Verify the full flow
1. Open http://localhost:3000/signin. You should see **Continue with Google**.
2. Click it. Google's account chooser opens, and the address bar shows `redirect_uri=http://localhost:3000/accounts/google/login/callback/`.
3. Pick a **test user**. You return to `/account`, signed in, with your Google name, email and photo.
4. Add something to the cart while signed out, then sign in. The cart is merged into your account's cart.
5. Sign out from `/account`, then sign in again. Your saved cart and order history are still there.
6. Start sign-in and click **Cancel** on Google's screen. You land on `/signin?error=cancelled` with a friendly message.

**Common errors**

| Error | Fix |
|---|---|
| `redirect_uri_mismatch` | The URI in step 2.4 must match exactly: `http` vs `https`, the port, and the trailing `/`. |
| `access_denied` / "app is in testing" | Add the account under **Test users**. |
| CSRF failure after Google | Use `http://localhost:3000`, not `127.0.0.1:3000`. Cookies are per-host. |

---

## 3. Mailgun (order confirmation emails)

### 3.1 Quick start with the sandbox domain
1. Sign up at https://www.mailgun.com. A sandbox domain such as `sandboxXXXX.mailgun.org` is created for you.
2. **Sandbox restriction:** it can only send to **authorized recipients** (up to 5). Go to **Sending → Domains → sandbox… → Authorized recipients**, add your address, and click the confirmation link Mailgun emails you.
3. Create an API key under **Account (top-right) → API Security / API keys**. Prefer a **domain sending key** scoped to the domain.
4. In `backend/.env`:
   ```
   MAIL_BACKEND=mailgun
   MAILGUN_API_KEY=...
   MAILGUN_DOMAIN=sandboxXXXX.mailgun.org
   MAILGUN_REGION=us            # "eu" if the domain was created in the EU region
   MAIL_FROM=Conzoomer <postmaster@sandboxXXXX.mailgun.org>
   ```
5. Restart Django, then place an order using the authorized email address. The confirmation page should say *"A confirmation email was sent to …"*. The admin (**Notifications → Email messages**) shows `Sent via Mailgun` and Mailgun's message ID.

If you see `failed` with `Mailgun 403: Domain … is not allowed to send` or similar, the recipient isn't authorized for the sandbox.

### 3.2 Your own domain (needed to email anyone)
1. Go to **Sending → Domains → Add new domain**. Use a subdomain such as `mg.yourdomain.com`, and pick the **US** or **EU** region. It must match `MAILGUN_REGION`.
2. Add the DNS records Mailgun shows at your DNS provider:

   | Type | Host | Value (from Mailgun) | Purpose |
   |---|---|---|---|
   | TXT | `mg.yourdomain.com` | `v=spf1 include:mailgun.org ~all` | SPF |
   | TXT | `xxx._domainkey.mg.yourdomain.com` | `k=rsa; p=MIGf…` | DKIM signing |
   | MX | `mg.yourdomain.com` | `mxa.mailgun.org` / `mxb.mailgun.org` (priority 10) | Receiving and bounces (recommended) |
   | CNAME | `email.mg.yourdomain.com` | `mailgun.org` | Click/open tracking (optional) |
   | TXT | `_dmarc.yourdomain.com` | `v=DMARC1; p=none; rua=mailto:you@yourdomain.com` | DMARC (recommended) |

3. Click **Verify DNS settings** and wait until SPF and DKIM are green. DNS can take anywhere from minutes to 48 hours.
4. Set `MAILGUN_DOMAIN=mg.yourdomain.com` and `MAIL_FROM=Conzoomer <orders@mg.yourdomain.com>`.

### 3.3 How delivery works
- The email is written to an **outbox row** (`EmailMessage`) inside the same database transaction as the order. If the order rolls back, no email exists; if the order commits, the email is guaranteed to be queued.
- Right after commit, Django tries to send it once, with an 8-second timeout. A Mailgun outage never fails or undoes the order, and the shopper still sees their confirmation.
- Failures are retried by `python manage.py send_pending_emails` with backoff (1, 5, 15, 60, 180 and 720 minutes), up to `MAIL_MAX_ATTEMPTS`. Mailgun 400 errors are treated as permanent.
- Duplicates are prevented by a unique `dedupe_key` (`order_confirmation:<reference>`) and an atomic `pending → sending` claim. Only one process can send a given message.
- **Limitation:** if a process crashes *after* Mailgun accepted a message but *before* the row was marked sent, the message is released after 10 minutes and could be sent a second time. This is the usual at-least-once trade-off.
- In the admin, **Retry selected emails now** re-queues failed messages. It also lets you re-send a local preview through Mailgun once Mailgun is configured.
