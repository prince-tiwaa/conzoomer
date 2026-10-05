# Mobile submission: build, upload and video script

## 1. Deploy the backend and website changes

Push to GitHub. Render redeploys both services. The backend build runs the new migrations (API tokens and mobile sign-in codes) automatically.

Check that both work:
- https://conzoomer-shop.onrender.com/signin shows **Sign in / Create account** tabs
- https://conzoomer.onrender.com/api/health returns `"database": "ok"`

## 2. Build the APK

```powershell
cd "C:\ZEDU PROJECTS\Conzoomer\mobile"
npm install
npm install -g eas-cli
eas login
eas init
eas build -p android --profile preview
```

When the build finishes, download the `.apk` from the link EAS prints.

## 3. Upload to Google Drive

1. Upload the `.apk` to Google Drive.
2. Right-click it → **Share** → **General access: Anyone with the link** (Viewer) → **Copy link**.
3. Open the link in a private window to check that it downloads without signing in.

## 4. Before recording

- Install the APK on your **physical phone**.
- Open https://conzoomer-shop.onrender.com and the backend health URL once, a minute before you record. Free Render services sleep when idle.
- Use a **new** email address for the account, for example `yourname+demo1@gmail.com`.

## 5. Video script (one continuous take, about 2 minutes)

Keep both screens in view: record the laptop screen, and either hold the phone up to the camera or mirror it (for example with `scrcpy`, Windows Phone Link, or a second camera).

1. **Website:** open https://conzoomer-shop.onrender.com → **account icon** → **Create account**. Enter name, new email and password → **Create account**.
2. **Show you're logged in:** the account page shows your name and email, and *Signed in with: Email & password*.
3. **Website:** open a product (e.g. *Arc Table Lamp*) → **Add to cart**. Click the cart icon to show it.
4. **Phone:** open the **Conzoomer** app → **Account** tab → **Sign in** with the same email and password.
5. **Phone:** open the **Cart** tab. The lamp added on the website is there.
6. **Phone:** **Shop** tab → pick another product (e.g. *Porcelain Everyday Mug*) → **Add to cart** → **View cart**. Both items are listed.
7. **Website:** switch back to the browser tab showing the cart (or click the cart icon). The mug added on the phone now appears, and the cart count updates.

That covers Web → Mobile and Mobile → Web.

## 6. What to submit

- **APK download link:** the Google Drive link from step 3
- **Repository link:** your GitHub repo (the app is in the `mobile/` folder)
- **Video:** the recording from step 5
