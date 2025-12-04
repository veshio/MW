# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Musical Wheelhouse is a multiplayer music guessing game with Spotify integration. Players compete in real-time to guess song titles and artists from playlist tracks, earning points for correct answers.

## Development Commands

### Backend (Port 3001)
```bash
cd backend
npm run dev      # Start with nodemon (auto-reload)
npm start        # Start production server
```

### Frontend (Port 5173)
```bash
cd frontend
npm run dev      # Start Vite dev server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

### Running Both Services
You need TWO terminals running simultaneously:
1. Terminal 1: `cd backend && npm run dev`
2. Terminal 2: `cd frontend && npm run dev`

## Architecture

### High-Level System Design

**Monorepo Structure:**
- `/backend` - Express API server (port 3001)
- `/frontend` - React + Vite SPA (port 5173)

**Data Flow:**
```
Frontend ←→ Backend API ←→ Spotify API
    ↓
LocalStorage (multiplayer state sync)
```

### Multiplayer Architecture (Critical)

**LocalStorage-based Multiplayer:** The game uses `localStorage` as a cross-tab synchronization mechanism, NOT a traditional server-client websocket architecture. This is intentional and works as follows:

1. **Room State Storage:** Game state is stored in `localStorage` with keys like `room:{CODE}`
2. **Polling Mechanism:** Each client polls `localStorage` every 500ms to sync state
3. **Host Authority:** The host (playerId === game.hostId) has authority over:
   - Playlist selection
   - Track playback control
   - Round progression
   - Timer management
4. **Player Actions:** Players update their own buzz-in state and guesses directly to localStorage
5. **Race Conditions:** The first player to write a guess wins (based on localStorage write order)

**Key Implementation Details:**
- Storage wrapper in `frontend/src/App.jsx` (lines 9-32) provides async localStorage interface
- Game state sync happens in `useEffect` hook (line ~200) with 500ms polling interval
- All players read from localStorage, but only specific roles can write certain fields

### Authentication Flow

**Spotify OAuth with PKCE:**
1. User clicks "Host Game" → Frontend redirects to `/api/auth/login`
2. Backend generates PKCE code challenge, redirects to Spotify OAuth
3. Spotify redirects back to `/api/auth/callback` with auth code
4. Backend exchanges code for access token, creates session
5. Backend redirects to frontend with session token in URL params
6. Frontend stores session in localStorage, fetches user data

**Session Management:**
- Backend: In-memory `Map()` storage in `backend/src/routes/auth.js` (line 8)
- Frontend: `authService.js` manages session token in localStorage
- TTL: 1 hour (SESSION_TTL in auth.js)
- Production: Upgrade to Redis for multi-server deployments

### Spotify Integration

**Two-Level Authentication:**
1. **Client Credentials** (backend/src/config/spotify.js):
   - App-level access for public data
   - Automatically refreshes with 5-min buffer
   - Used for: Featured playlists (deprecated), search API

2. **User Authorization** (backend/src/routes/auth.js):
   - User-level access via OAuth PKCE
   - Scopes: streaming, playback control, playlist read, user read
   - Used for: User's playlists, Web Playback SDK, playback control

**Playback Systems:**
- **Desktop:** Spotify Web Playback SDK (frontend/src/services/spotifyPlayer.js)
  - Embedded playback in browser
  - Requires Spotify Premium
  - Full track playback
- **Mobile (Planned):** Spotify Connect API
  - Controls external Spotify device (phone/speaker)
  - Host selects device, music plays externally
  - 200-500ms latency (acceptable for in-person play)
- **Fallback:** HTML5 Audio (frontend/src/services/audioPlayer.js)
  - 30-second preview URLs
  - Works without Premium
  - Used when SDK and Connect API unavailable

**Caching:**
- Backend caches playlists and tracks in-memory (backend/src/services/spotifyService.js)
- TTL: 24 hours
- Cache structure:
  ```javascript
  {
    playlists: { 'cache_key': { data: [...], timestamp: ... } },
    tracks: Map(playlistId → { data: [...], timestamp: ... })
  }
  ```

### Mobile Browser Support (In Development)

**Current State:**
- Game works in mobile browsers for UI/gameplay
- Music playback limited to 30-second previews on mobile
- Web Playback SDK only works on desktop browsers

**Planned: Spotify Connect API Integration**
For in-person gameplay (party/game night scenarios):
- Host selects Spotify device (phone/speaker/laptop) via Connect API
- Music plays through host's selected device
- Only host needs Spotify Premium + device
- Players join on any device (no Spotify needed)
- See `.claude/plans/graceful-herding-wolf.md` for implementation details

### Point Scoring Rules

Complex scoring logic in `frontend/src/App.jsx` (~line 760-850):

1. **DJ picks own playlist:** Automatic +1 point to DJ
2. **Player guesses correctly:** +1 point per correct answer (song OR artist)
3. **Nobody guesses correctly:** DJ loses -1 point
4. **Skip round on DJ's playlist:** DJ loses -1 point
5. **Multiple correct guesses:** First player to write to localStorage wins

The DJ's dilemma: Picking your own playlist gives +1, but if nobody guesses, you lose -1.

### Game State Machine

States: 'home' → 'lobby' → 'playlist-select' → 'playing' → 'game-over'

**Transitions:**
- Home → Lobby: Create/join room
- Lobby → Playlist Select: Host starts game
- Playlist Select → Playing: DJ picks playlist
- Playing → Playing: Next round after countdown
- Playing → Game Over: All playlists exhausted

**Round Lifecycle:**
1. DJ picks playlist (if first round or DJ switches)
2. Random track selected from playlist
3. 3-second countdown
4. Music plays for 15 seconds
5. Players buzz in and guess
6. Points calculated, next DJ rotates

## Critical Configuration

### Environment Variables

**Backend (.env in /backend):**
```bash
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3001/api/auth/callback
FRONTEND_URL=http://127.0.0.1:5173
PORT=3001
NODE_ENV=development
```

**IMPORTANT:**
- Must use `127.0.0.1` (not `localhost`) - Spotify OAuth requirement
- Redirect URI must EXACTLY match Spotify Dashboard settings
- Frontend URL must match CORS allowlist in backend/src/server.js

### Port Requirements

- Backend: MUST be 3001 (hardcoded in frontend Vite proxy)
- Frontend: SHOULD be 5173 (Vite default, strictPort: true)
- These ports are referenced in:
  - frontend/vite.config.js (proxy target)
  - backend/src/server.js (CORS origins)
  - backend .env file (REDIRECT_URI)

Changing ports requires updates in ALL three locations.

### Vite Proxy Configuration

**Why it exists:**
- Avoids CORS preflight requests during development
- Requests to `/api/*` are proxied to `http://localhost:3001`
- Configured in `frontend/vite.config.js` (lines 11-16)

**How to use:**
```javascript
// ✅ Correct - relative path, uses proxy
fetch('/api/spotify/playlists')

// ❌ Wrong - absolute URL, bypasses proxy, triggers CORS
fetch('http://localhost:3001/api/spotify/playlists')
```

## Code Organization Patterns

### Service Layer Pattern

All external integrations use service objects:

**Frontend services (frontend/src/services/):**
- `apiClient.js` - HTTP wrapper for backend API
- `authService.js` - Authentication state management
- `spotifyPlayer.js` - Spotify Web Playback SDK wrapper
- `audioPlayer.js` - HTML5 Audio fallback

**Backend services:**
- `spotifyService.js` - High-level Spotify API with caching
- `spotifyClient.js` - Low-level Spotify HTTP client

**Pattern:** Services are exported as singletons with stateful configuration.

### Single-File Component

`frontend/src/App.jsx` is intentionally a single large file (~2600 lines). This is a conscious design choice for a small game with tightly coupled game state. All game logic, UI, and state management are co-located.

When modifying gameplay:
- Points logic: ~line 760-850
- Game state machine: Search for `setView()` calls
- Countdown/timer: ~line 269-295
- Playback control: ~line 213+
- Multiplayer sync: ~line 200

### Styling Approach

**Tailwind CSS 4.1.17:**
- Utility-first classes directly in JSX
- Custom animations in `frontend/src/index.css`
- Glassmorphism design with `backdrop-blur-md`, `bg-white/10`
- Premium gradient backgrounds: `bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900`

**Custom utilities:**
- `.animate-spin-slow` - 20s rotation (line 12)
- `.no-scrollbar` - Hides scrollbar while keeping scroll (lines 16-24)

**Design philosophy:** No external UI libraries. All components hand-crafted with Tailwind.

## Common Gotchas

### 1. Spotify API Endpoints Deprecation
The `/browse/featured-playlists` endpoint was removed by Spotify on Nov 27, 2024. The codebase now uses `/search?type=playlist` instead (see backend/src/services/spotifyService.js lines 21-135).

### 2. localStorage Multiplayer Race Conditions
When multiple players buzz in simultaneously, the first write to localStorage wins. This is intentional but can feel unfair. The game shows "Already answered!" if someone else wrote first.

### 3. Spotify Premium Requirement
Web Playback SDK only works with Spotify Premium accounts. Free users fall back to 30-second previews via HTML5 Audio.

### 4. CORS and 127.0.0.1 vs localhost
Spotify OAuth requires `127.0.0.1` in redirect URIs. The backend CORS config allows both, but OAuth callbacks MUST use `127.0.0.1`.

### 5. Session Storage is In-Memory
Sessions are lost on server restart. This is acceptable for development but requires Redis for production.

### 6. Web Playback SDK Mobile Limitation
The Spotify Web Playback SDK does NOT work on mobile browsers (iOS/Android). Mobile hosts must use Spotify Connect API to control an external device, or use 30-second preview fallback.

## Deployment Notes

**Production checklist:**
1. Set `NODE_ENV=production` in backend
2. Upgrade session storage from Map() to Redis
3. Update FRONTEND_URL and SPOTIFY_REDIRECT_URI to production domains
4. Build frontend: `cd frontend && npm run build`
5. Serve frontend/dist via CDN or static hosting
6. Update Spotify Dashboard with production redirect URI
7. Set rate limiting appropriately (currently 100 req/15min)

**Environment differences:**
- Development: In-memory sessions, CORS allows localhost
- Production: Redis sessions, CORS allows production domain only

## Testing the Game

**Manual test flow:**
1. Start backend + frontend
2. Open `http://127.0.0.1:5173` in TWO browser tabs
3. Tab 1: Click "Host Game" → Spotify login → Create room
4. Tab 2: Enter room code from Tab 1 → Join as "Player 2"
5. Tab 1: Start game → Pick playlist
6. Both tabs: Observe synchronized countdown and playback
7. Tab 2: Click "BUZZ IN!" → Enter guess
8. Verify points update in both tabs

**Testing multiplayer without multiple browsers:**
- Use same browser, different tabs (localStorage is shared per origin)
- Or use incognito + normal window

## Key Files Reference

**Must-read for gameplay changes:**
- `frontend/src/App.jsx` - All game logic and UI
- `backend/src/services/spotifyService.js` - Playlist fetching, caching

**Must-read for auth issues:**
- `backend/src/routes/auth.js` - OAuth flow
- `frontend/src/services/authService.js` - Session management

**Must-read for playback issues:**
- `frontend/src/services/spotifyPlayer.js` - Web Playback SDK
- `backend/src/config/spotify.js` - Token management

**Must-read for mobile/Connect API work:**
- `frontend/src/services/spotifyConnect.js` - Connect API client (when implemented)
- `backend/src/routes/spotify.js` - Connect API endpoints (devices, play, pause)
- Always be ruthlesly honest and truthful. Do not exagerate or be dramatic. Always state things to the best of your knowwledge and be transparant about your abilities. I want you to pretend like you are an expert mentor looking to make sure I build the best possible app