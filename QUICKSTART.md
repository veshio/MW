# Quick Start - Production Deployment

Get Musical Wheelhouse deployed in under 10 minutes.

## 🚀 Fastest Path: Render.com

### Step 1: Push to GitHub

```bash
git add .
git commit -m "Prepare for deployment"
git push origin main
```

### Step 2: Deploy Backend (3 minutes)

1. Go to https://dashboard.render.com/
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Fill in:
   - **Name:** `musical-wheelhouse-backend`
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Add environment variables:
   ```
   NODE_ENV=production
   SPOTIFY_CLIENT_ID=<from Spotify Dashboard>
   SPOTIFY_CLIENT_SECRET=<from Spotify Dashboard>
   SPOTIFY_REDIRECT_URI=https://musical-wheelhouse-backend.onrender.com/api/auth/callback
   FRONTEND_URL=https://musical-wheelhouse-frontend.onrender.com
   ```
6. Click **Create Web Service**
7. **Copy the URL** (you'll need it)

### Step 3: Deploy Frontend (2 minutes)

1. Click **New +** → **Static Site**
2. Connect same repository
3. Fill in:
   - **Name:** `musical-wheelhouse-frontend`
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
4. Add environment variable:
   ```
   VITE_API_URL=<paste backend URL from Step 2>
   ```
5. Create `frontend/public/_redirects`:
   ```
   /*  /index.html  200
   ```
6. Click **Create Static Site**
7. **Copy the frontend URL**

### Step 4: Update Spotify App (1 minute)

1. Go to https://developer.spotify.com/dashboard
2. Select your app → **Edit Settings**
3. Add to **Redirect URIs:**
   ```
   https://musical-wheelhouse-backend.onrender.com/api/auth/callback
   ```
4. **Save**

### Step 5: Update Backend Environment (1 minute)

Go back to Render backend service:
1. **Environment** tab
2. Update `FRONTEND_URL` to actual frontend URL from Step 3
3. **Save Changes** (will trigger redeploy)

### Step 6: Test 🎉

1. Visit your frontend URL
2. Click "Host Game"
3. Log in with Spotify
4. You're live!

---

## 📝 Important Notes

### Free Tier Limitations

**Render.com Free Tier:**
- Backend spins down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds
- Perfect for demos and testing
- Upgrade to Starter ($7/mo) for always-on

### URL Format

Your URLs will be:
- Backend: `https://musical-wheelhouse-backend.onrender.com`
- Frontend: `https://musical-wheelhouse-frontend.onrender.com`

Custom domains available on paid plans.

### Cold Starts

On free tier, the first request after inactivity will be slow. Users might see:
- "Loading..." for 20-30 seconds
- This is normal and only happens once
- Subsequent requests are fast

---

## 🔧 Troubleshooting Quick Fixes

### "CORS Error"
→ Check `FRONTEND_URL` in backend matches actual frontend URL

### "redirect_uri_mismatch"
→ Verify Spotify Dashboard redirect URI exactly matches `SPOTIFY_REDIRECT_URI`

### "Backend not responding"
→ Check backend logs in Render dashboard → Logs tab

### "Can't connect to server"
→ Wait 30 seconds (cold start), then refresh

---

## 🎯 Next Steps

- [Full Deployment Guide](./DEPLOYMENT.md) - All platforms, detailed troubleshooting
- [Development Guide](./CLAUDE.md) - Local development, architecture
- Set up custom domain (Render Settings → Custom Domain)
- Add error tracking with Sentry
- Monitor usage and performance

---

## 💡 Pro Tips

1. **Keep environment variables in sync** - If you change URLs, update both services
2. **Test locally first** - Run `npm run build` before deploying
3. **Check logs regularly** - Catch errors early in Render dashboard
4. **Use preview deployments** - Render auto-deploys on new commits
5. **Upgrade for production** - Free tier is great for testing, upgrade for real traffic

---

**Need help?** Check [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed guides and troubleshooting.
