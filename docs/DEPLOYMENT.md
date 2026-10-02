# Deployment

The recommended setup keeps **one public origin** for shoppers, so session cookies, CSRF and the Google callback behave exactly as they do locally:

```
Browser ──► Next.js storefront (e.g. Vercel)  ── /api, /accounts, /admin, /static ──►  Django (e.g. Render)  ──►  Neon
```

## 1. Backend (Django) — example: Render Web Service

1. Push the repository to GitHub.
2. In Render, choose **New → Web Service** and pick the repo.
   - **Root directory:** `backend`
   - **Build command** (runs migrations and the idempotent seed on every deploy, which also works on the free plan where pre-deploy commands and shell access aren't available):
     ```
     pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate --noinput && python manage.py seed_catalog
     ```
   - **Start command:** `gunicorn config.wsgi --bind 0.0.0.0:$PORT --workers 2 --timeout 30`
   - **Health check path:** `/api/health`
3. Environment variables (see `.env.example`):
   ```
   DJANGO_DEBUG=false
   DJANGO_SECRET_KEY=<long random string>
   DATABASE_URL=<Neon connection string>
   FRONTEND_URL=https://conzoomer.vercel.app
   DJANGO_ALLOWED_HOSTS=conzoomer.vercel.app,conzoomer-api.onrender.com
   DJANGO_CSRF_TRUSTED_ORIGINS=https://conzoomer.vercel.app
   GOOGLE_OAUTH_CLIENT_ID=...
   GOOGLE_OAUTH_CLIENT_SECRET=...
   MAIL_BACKEND=mailgun
   MAILGUN_API_KEY=...
   MAILGUN_DOMAIN=...
   MAILGUN_REGION=us
   MAIL_FROM=Conzoomer <orders@mg.yourdomain.com>
   ```
   `DJANGO_ALLOWED_HOSTS` must include the **storefront** host, because proxied requests carry it in `X-Forwarded-Host`.
4. Create the admin user from your own computer. Your local `backend/.env` points at the same Neon database, so `python manage.py createsuperuser` works there.
5. Static files (the Django admin CSS) are served by WhiteNoise, so no extra service is needed.

## 2. Email retry worker

Choose one:
- **Render Cron Job** (simplest). Same repo and root `backend`, schedule `*/5 * * * *`, command `python manage.py send_pending_emails`, with the same environment variables.
- **Background Worker:** `python manage.py send_pending_emails --loop --interval 30`.
- **Manual (demo only):** in the admin, go to **Email messages**, select the messages and choose **Retry selected emails now**.

Most emails are sent immediately after checkout. The worker only handles retries.

## 3. Frontend (Next.js) — example: Vercel

1. In Vercel, choose **New Project**, import the repo, and set **Root Directory** to `frontend`.
2. Environment variables:
   ```
   BACKEND_URL=https://conzoomer-api.onrender.com
   NEXT_PUBLIC_SUPPORT_EMAIL=hello@yourdomain.com
   ```
3. Deploy. The rewrites in `next.config.ts` forward `/api`, `/accounts`, `/admin` and `/static` to `BACKEND_URL`.
4. Add `https://<your-vercel-domain>/accounts/google/login/callback/` to the Google OAuth client, plus the domain as a JavaScript origin.
5. Start a Google sign-in and check the `redirect_uri` in Google's URL. It must show the storefront domain. If it shows the backend's own domain, your host isn't forwarding `X-Forwarded-Host`. Set `DJANGO_PUBLIC_HOST=<your-vercel-domain>` on the backend.

## 3b. Frontend on Render instead of Vercel

Create a second **Web Service** from the same repo:
- **Root directory:** `frontend`
- **Runtime:** Node (set the environment variable `NODE_VERSION=22`)
- **Build command:** `npm ci && npm run build`
- **Start command:** `npx next start -p $PORT` (Render assigns the port, so don't use `npm start`, which is fixed to 3000)
- **Environment:** `BACKEND_URL=https://<your-backend>.onrender.com`, `NEXT_PUBLIC_SUPPORT_EMAIL=...`

Then point the backend's `FRONTEND_URL`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS` and the Google redirect URI at the frontend's `onrender.com` address.

Free Render services sleep when idle, so the first request after a pause can take 30–60 seconds. Open both URLs a minute before you present.

## 4. Production checklist

- [ ] `DJANGO_DEBUG=false` and a strong `DJANGO_SECRET_KEY`
- [ ] `python manage.py check --deploy` shows only the HSTS subdomain/preload notices
- [ ] HTTPS everywhere (`SECURE_SSL_REDIRECT`, secure cookies and HSTS are switched on automatically when DEBUG is off)
- [ ] `DEV_LOGIN_ENABLED` unset. It is ignored when DEBUG is off anyway.
- [ ] Migrations applied and catalog seeded
- [ ] Google redirect URI added for the production domain, and the app published or test users added
- [ ] Mailgun domain verified (SPF and DKIM green), with `MAIL_FROM` on that domain
- [ ] Email retry worker or cron running

## 5. Single-server alternative

On one VM, run gunicorn on `127.0.0.1:8000` and `npm run build && npm start` on `:3000` behind nginx or Caddy terminating TLS, and proxy everything to port 3000. Set `BACKEND_URL=http://127.0.0.1:8000`.
