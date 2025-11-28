# Port Configuration - Musical Wheelhouse

## Standard Ports (DO NOT CHANGE)

### Development
- **Frontend**: `http://127.0.0.1:5173`
- **Backend**: `http://127.0.0.1:3001`

### Why 127.0.0.1 instead of localhost?
Spotify OAuth requires exact domain matching. We use `127.0.0.1` throughout to ensure consistency.

## Configuration Files

### Frontend
- **vite.config.js**: Port 5173 (Vite default)
- Proxy: `/api` → `http://localhost:3001`

### Backend
- **backend/.env**:
  - `PORT=3001`
  - `FRONTEND_URL=http://127.0.0.1:5173`
  - `SPOTIFY_REDIRECT_URI=http://127.0.0.1:3001/api/auth/callback`

### Spotify Developer Dashboard
Make sure your Spotify app has this redirect URI:
```
http://127.0.0.1:3001/api/auth/callback
```

## How to Start Development Servers

```bash
# Terminal 1 - Backend
cd backend
npm run dev
# Runs on http://127.0.0.1:3001

# Terminal 2 - Frontend
cd frontend
npm run dev
# Runs on http://127.0.0.1:5173
```

## Access the App
Open: **http://127.0.0.1:5173**

## Production Deployment
Update these in production:
- `backend/.env`: Set `FRONTEND_URL` to your production domain
- `backend/.env`: Set `SPOTIFY_REDIRECT_URI` to `https://your-domain.com/api/auth/callback`
- Add production redirect URI to Spotify Developer Dashboard
