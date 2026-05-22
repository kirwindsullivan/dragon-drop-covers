# Dragon Drop Covers — Deployment Guide

## Step 1: Push to GitHub

1. Go to [github.com/new](https://github.com/new)
2. Create a new **private** repository named `dragon-drop-covers`
3. Do **not** add a README, .gitignore, or license (you already have them)
4. Copy the two commands GitHub shows you under "push an existing repository":

```bash
git remote add origin https://github.com/YOUR_USERNAME/dragon-drop-covers.git
git push -u origin master
```

Run those in your terminal from the project folder.

---

## Step 2: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (or sign up — free tier is fine to start)
2. Click **Add New → Project**
3. Connect your GitHub account if prompted
4. Import the `dragon-drop-covers` repository
5. Vercel auto-detects Next.js — leave all build settings as-is
6. Click **Deploy**

Your app will be live at `https://dragon-drop-covers.vercel.app` (or a similar URL) in ~2 minutes.

---

## Step 3: Add Environment Variables on Vercel

Go to your project on Vercel → **Settings → Environment Variables** and add:

| Variable | Value |
|---|---|
| `NEXTAUTH_SECRET` | Run `openssl rand -base64 32` in your terminal and paste the result |
| `NEXTAUTH_URL` | Your Vercel URL, e.g. `https://dragon-drop-covers.vercel.app` |
| `CLOUDFLARE_R2_ACCOUNT_ID` | From your Cloudflare dashboard |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | From your R2 API token |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | From your R2 API token |
| `CLOUDFLARE_R2_BUCKET_NAME` | `dragon-drop-covers` (or whatever you named it) |
| `CLOUDFLARE_R2_PUBLIC_URL` | Your R2 public bucket URL |

After adding variables, click **Redeploy** to apply them.

---

## Step 4: Set Up Cloudflare R2 (for cover uploads)

1. Log in at [dash.cloudflare.com](https://dash.cloudflare.com)
2. Go to **R2 Object Storage → Create Bucket**
3. Name it `dragon-drop-covers`, choose a region close to your users
4. Go to **Manage R2 API Tokens → Create API Token**
   - Permissions: **Object Read & Write**
   - Scope: the bucket you just created
5. Copy the Account ID, Access Key ID, and Secret Access Key into your Vercel env vars

> The app works fully **without** R2 for local development — covers are stored as object URLs in the browser. R2 is only needed for persistent storage in production.

---

## Step 5: Future Deployments

Every time you push to `main`/`master`, Vercel automatically redeploys. You don't need to do anything.

```bash
# Make changes, then:
git add -A
git commit -m "your change description"
git push
```

Vercel picks it up automatically.

---

## Dropping in a Real Book Model (from Sketchfab)

1. Download your `.glb` from Sketchfab
2. Place it in `/public/models/hardcover.glb` (or whichever size it is)
3. Open `src/components/editor/BookScene.tsx`
4. Uncomment the corresponding line in `MODEL_PATHS`:

```typescript
const MODEL_PATHS: Partial<Record<BookSize, string>> = {
  hardcover: "/models/hardcover.glb", // ← uncomment this
};
```

The cover texture will be applied to any mesh whose material name contains `"cover"`.
