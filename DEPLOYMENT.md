# Deployment Guide

This guide covers deploying Musical Wheelhouse to production on various cloud platforms.

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Variables](#environment-variables)
3. [Platform-Specific Guides](#platform-specific-guides)
   - [Render.com (Recommended)](#rendercom-recommended)
   - [Railway](#railway)
   - [Vercel + Railway](#vercel--railway)
4. [Post-Deployment](#post-deployment)
5. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

Before deploying, ensure you have:

- [ ] Spotify Developer Account with app credentials
- [ ] Git repository (GitHub, GitLab, etc.)
- [ ] Updated `.env` files with production values
- [ ] Tested the app locally with `npm run dev`
- [ ] Run `npm run build` successfully in frontend

---

## Environment Variables

### Backend Environment Variables

**Required:**
- `SPOTIFY_CLIENT_ID` - Your Spotify app client ID
- `SPOTIFY_CLIENT_SECRET` - Your Spotify app client secret
- `SPOTIFY_REDIRECT_URI` - OAuth callback URL (e.g., `https://your-backend.com/api/auth/callback`)
- `FRONTEND_URL` - Your frontend URL (e.g., `https://your-app.com`)
- `NODE_ENV` - Set to `production`
- `PORT` - Backend port (usually auto-assigned by platform)

**Optional:**
- `SESSION_TTL` - Session timeout in ms (default: 3600000 = 1 hour)

### Frontend Environment Variables

**Required:**
- `VITE_API_URL` - Your backend URL (e.g., `https://your-backend.com`)

---

## Platform-Specific Guides

### Render.com (Recommended)

**Why Render?**
- Free tier available
- Easy deployment from Git
- Automatic HTTPS
- Simple environment variable management
- Good for monorepos

**Backend Deployment:**

1. **Create Web Service:**
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click "New +" → "Web Service"
   - Connect your Git repository
   - Configure:
     - **Name:** `musical-wheelhouse-backend`
     - **Region:** Choose closest to your users
     - **Branch:** `main` (or your default branch)
     - **Root Directory:** `backend`
     - **Environment:** `Node`
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Plan:** Free

2. **Set Environment Variables:**
   ```
   NODE_ENV=production
   SPOTIFY_CLIENT_ID=<your_client_id>
   SPOTIFY_CLIENT_SECRET=<your_client_secret>
   SPOTIFY_REDIRECT_URI=https://musical-wheelhouse-backend.onrender.com/api/auth/callback
   FRONTEND_URL=https://musical-wheelhouse-frontend.onrender.com
   ```

3. **Deploy:**
   - Click "Create Web Service"
   - Wait for deployment (2-5 minutes)
   - Copy the backend URL (e.g., `https://musical-wheelhouse-backend.onrender.com`)

**Frontend Deployment:**

1. **Create Static Site:**
   - Click "New +" → "Static Site"
   - Connect your Git repository
   - Configure:
     - **Name:** `musical-wheelhouse-frontend`
     - **Branch:** `main`
     - **Root Directory:** `frontend`
     - **Build Command:** `npm install && npm run build`
     - **Publish Directory:** `dist`

2. **Set Environment Variables:**
   ```
   VITE_API_URL=https://musical-wheelhouse-backend.onrender.com
   ```

3. **Configure Redirects:**
   - Create `frontend/public/_redirects` file:
     ```
     /*  /index.html  200
     ```

4. **Deploy:**
   - Click "Create Static Site"
   - Wait for build (2-5 minutes)
   - Copy frontend URL

**Update Spotify Dashboard:**
- Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
- Select your app
- Click "Edit Settings"
- Add to **Redirect URIs:**
  ```
  https://musical-wheelhouse-backend.onrender.com/api/auth/callback
  ```
- Save

---

### Railway

**Why Railway?**
- Generous free tier ($5/month credit)
- Excellent developer experience
- Automatic preview deployments
- Built-in metrics

**Backend Deployment:**

1. **Create Project:**
   - Go to [Railway Dashboard](https://railway.app/)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository

2. **Configure Service:**
   - Click "Add Service" → "GitHub Repo"
   - Select backend directory
   - Set **Root Directory:** `/backend`
   - Set **Start Command:** `npm start`

3. **Set Environment Variables:**
   ```
   NODE_ENV=production
   SPOTIFY_CLIENT_ID=<your_client_id>
   SPOTIFY_CLIENT_SECRET=<your_client_secret>
   SPOTIFY_REDIRECT_URI=https://<your-backend-domain>.railway.app/api/auth/callback
   FRONTEND_URL=https://<your-frontend-domain>.railway.app
   PORT=${{PORT}}
   ```

4. **Generate Domain:**
   - Go to "Settings" → "Networking"
   - Click "Generate Domain"
   - Copy the domain

**Frontend Deployment:**

1. **Add Frontend Service:**
   - Click "New Service" in same project
   - Select GitHub repo
   - Set **Root Directory:** `/frontend`
   - Set **Build Command:** `npm install && npm run build`
   - Set **Start Command:** `npx serve -s dist -p $PORT`

2. **Install `serve` in frontend:**
   ```bash
   cd frontend
   npm install --save-dev serve
   ```

3. **Set Environment Variables:**
   ```
   VITE_API_URL=https://<backend-domain>.railway.app
   ```

4. **Generate Domain** and copy URL

**Update Spotify Dashboard** with Railway backend callback URL.

---

### Vercel + Railway

**Why This Combo?**
- Vercel is excellent for static frontends (free tier)
- Railway handles backend (free tier)
- Best performance for React apps

**Backend: Railway** (follow Railway backend steps above)

**Frontend: Vercel**

1. **Create Project:**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New..." → "Project"
   - Import your Git repository

2. **Configure:**
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

3. **Environment Variables:**
   ```
   VITE_API_URL=https://<backend-domain>.railway.app
   ```

4. **Deploy:**
   - Click "Deploy"
   - Wait for deployment
   - Copy Vercel URL

**Update Railway backend `FRONTEND_URL`** with Vercel URL.

**Update Spotify Dashboard** with Railway backend callback URL.

---

## Post-Deployment

### 1. Update Spotify App Settings

Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard):

1. Select your app
2. Click "Edit Settings"
3. Add production redirect URI:
   ```
   https://your-backend-domain.com/api/auth/callback
   ```
4. Save changes

### 2. Test Authentication Flow

1. Visit your frontend URL
2. Click "Host Game"
3. Log in with Spotify
4. Verify you're redirected back correctly
5. Check that playlists load

### 3. Test Multiplayer

1. Open frontend URL in two browser tabs
2. Create room in Tab 1
3. Join room in Tab 2
4. Start game and verify synchronization

### 4. Monitor Logs

Check platform-specific logs for errors:
- **Render:** Logs tab in service dashboard
- **Railway:** Deployments → View Logs
- **Vercel:** Deployment → Function Logs

---

## Troubleshooting

### CORS Errors

**Symptom:** `Access to fetch blocked by CORS policy`

**Solutions:**
1. Verify `FRONTEND_URL` in backend matches actual frontend URL (including https://)
2. Check browser console for exact origin being blocked
3. Ensure no trailing slashes in URLs
4. For custom domains, update `FRONTEND_URL` after DNS propagates

### OAuth Redirect Mismatch

**Symptom:** `redirect_uri_mismatch` error from Spotify

**Solutions:**
1. Ensure `SPOTIFY_REDIRECT_URI` exactly matches what's in Spotify Dashboard
2. Check for http vs https
3. Verify no extra path segments or trailing slashes
4. Wait 5-10 minutes after updating Spotify Dashboard settings

### 502 Bad Gateway / Backend Not Responding

**Symptom:** Frontend loads but API calls fail

**Solutions:**
1. Check backend service is running (platform dashboard)
2. Verify `VITE_API_URL` points to correct backend URL
3. Test backend health endpoint: `https://your-backend.com/health`
4. Check backend logs for errors
5. Ensure backend has required environment variables set

### localStorage Multiplayer Not Syncing

**Symptom:** Players in different tabs don't see each other's actions

**Note:** This is expected! localStorage is per-origin. For cross-device multiplayer:

1. Both players must be on the same deployed URL
2. localStorage only syncs across tabs on the same browser/device
3. For true cross-device multiplayer, you'd need WebSockets or database (future enhancement)

### Spotify Playback Not Working

**Symptom:** Songs don't play after starting game

**Solutions:**
1. Verify user has Spotify Premium (Web Playback SDK requirement)
2. Check browser console for Spotify SDK errors
3. Ensure access token is being fetched correctly
4. Try on different browser (Chrome/Edge work best)
5. For mobile: This is a known limitation (see CLAUDE.md for Connect API workaround)

### Build Failures

**Symptom:** Deployment fails during build

**Solutions:**
1. Test build locally first: `npm run build`
2. Check Node version compatibility (requires Node 18+)
3. Verify all dependencies are in `package.json` (not just devDependencies)
4. Clear platform cache and redeploy
5. Check platform build logs for specific error

### Port Already in Use (Local Development)

**Symptom:** `EADDRINUSE: address already in use`

**Solutions:**

**Windows:**
```bash
# Find process using port 3001
netstat -ano | findstr :3001

# Kill process (replace PID with actual process ID)
taskkill /PID <PID> /F

# Or use different port in .env
PORT=3002
```

**Mac/Linux:**
```bash
# Find and kill process using port 3001
lsof -ti:3001 | xargs kill -9

# Or use different port in .env
PORT=3002
```

---

## Platform Comparison

| Feature | Render | Railway | Vercel + Railway |
|---------|--------|---------|------------------|
| Free Tier | ✅ Both services | ✅ $5/month credit | ✅ Both generous |
| Setup Complexity | Easy | Easy | Medium |
| Monorepo Support | ✅ Excellent | ✅ Excellent | ⚠️ Requires split |
| Build Time | ~2-3 min | ~2-3 min | ~1-2 min (frontend) |
| Custom Domains | ✅ Free | ✅ Free | ✅ Free |
| Auto HTTPS | ✅ Yes | ✅ Yes | ✅ Yes |
| Cold Starts | ~30s (free tier) | ~5s | ~0s (frontend) |
| Best For | Simplicity | DX & metrics | Performance |

---

## Production Checklist

Before going live:

- [ ] All environment variables set correctly
- [ ] Spotify redirect URIs updated
- [ ] HTTPS enabled (automatic on all platforms)
- [ ] Test authentication flow end-to-end
- [ ] Test multiplayer functionality
- [ ] Check CORS configuration
- [ ] Monitor backend health endpoint
- [ ] Set up error tracking (optional: Sentry, LogRocket)
- [ ] Configure custom domain (optional)
- [ ] Document backend/frontend URLs for team

---

## Need Help?

- Check platform-specific documentation
- Review backend logs in platform dashboard
- Test each endpoint individually using curl or Postman
- Verify environment variables are correctly set
- Ensure Spotify Dashboard settings match deployment URLs
