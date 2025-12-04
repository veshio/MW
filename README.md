# 🎵 Musical Wheelhouse

A multiplayer music guessing game with Spotify integration. Players compete in real-time to guess song titles and artists from playlist tracks.

![License](https://img.shields.io/badge/license-ISC-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![React](https://img.shields.io/badge/react-19.2.0-blue)

## ✨ Features

- 🎮 **Real-time Multiplayer** - Play with friends using room codes
- 🎵 **Spotify Integration** - Use your own playlists or search public ones
- 🏆 **Point Scoring** - Complex scoring system with DJ dilemmas
- 🎨 **Premium UI** - Glassmorphism design with smooth animations
- 📱 **Mobile Support** - Works on mobile browsers (with preview audio)
- 🔒 **Secure OAuth** - Spotify OAuth with PKCE flow

## 🚀 Quick Start

### Local Development

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd musical-wheelhouse
   ```

2. **Set up Spotify App**
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Create new app
   - Add redirect URI: `http://127.0.0.1:3001/api/auth/callback`
   - Copy Client ID and Client Secret

3. **Configure Backend**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with your Spotify credentials
   npm install
   npm run dev
   ```

4. **Configure Frontend** (in new terminal)
   ```bash
   cd frontend
   cp .env.example .env
   # Keep VITE_API_URL empty for development
   npm install
   npm run dev
   ```

5. **Open the app**
   - Visit `http://127.0.0.1:5173` (must use 127.0.0.1, not localhost)
   - Click "Host Game" and log in with Spotify

### Production Deployment

See [QUICKSTART.md](./QUICKSTART.md) for fastest deployment path (Render.com).

See [DEPLOYMENT.md](./DEPLOYMENT.md) for comprehensive deployment guide covering multiple platforms.

## 📁 Project Structure

```
musical-wheelhouse/
├── backend/              # Express API server
│   ├── src/
│   │   ├── routes/      # API routes (auth, spotify)
│   │   ├── services/    # Spotify integration
│   │   ├── config/      # Configuration
│   │   └── server.js    # Main server file
│   └── package.json
├── frontend/            # React + Vite SPA
│   ├── src/
│   │   ├── services/   # API clients, auth, playback
│   │   ├── App.jsx     # Main game logic (single-file component)
│   │   └── index.css   # Tailwind styles
│   └── package.json
├── DEPLOYMENT.md       # Full deployment guide
├── QUICKSTART.md       # Fast deployment guide
└── CLAUDE.md          # Architecture & development guide
```

## 🎮 How to Play

1. **Host creates room** - Click "Host Game", log in with Spotify
2. **Players join** - Enter room code on home screen
3. **Host starts game** - Select number of rounds
4. **DJ picks playlist** - First DJ selects a playlist
5. **Guess the song!** - Players have 15 seconds to buzz in and guess
6. **Scoring:**
   - Correct song/artist = +1 point
   - DJ gets +1 if they pick own playlist
   - DJ loses -1 if nobody guesses correctly
7. **Next round** - DJ rotates to next player
8. **Winner** - Highest score after all rounds

## 🛠️ Tech Stack

**Frontend:**
- React 19.2.0
- Vite 7.2.4
- Tailwind CSS 4.1.17
- Spotify Web Playback SDK

**Backend:**
- Node.js 18+
- Express 4.18.2
- Spotify Web API
- PKCE OAuth flow

**Multiplayer:**
- LocalStorage-based sync (cross-tab)
- Polling mechanism (500ms)
- Host-authority game state

## 📝 Environment Variables

### Backend (.env)
```bash
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3001/api/auth/callback
FRONTEND_URL=http://127.0.0.1:5173
PORT=3001
NODE_ENV=development
```

### Frontend (.env)
```bash
# Development: Leave empty (uses Vite proxy)
VITE_API_URL=

# Production: Set to backend URL
# VITE_API_URL=https://your-backend.com
```

## 🔧 Development Commands

### Backend
```bash
cd backend
npm run dev      # Start with nodemon (auto-reload)
npm start        # Start production server
```

### Frontend
```bash
cd frontend
npm run dev      # Start Vite dev server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## 📚 Documentation

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Comprehensive deployment guide
- [QUICKSTART.md](./QUICKSTART.md) - Fast deployment in 10 minutes
- [CLAUDE.md](./CLAUDE.md) - Architecture, patterns, and development guide

## 🐛 Known Limitations

1. **LocalStorage Multiplayer** - Only syncs across tabs on same device
2. **Spotify Premium Required** - For full playback (falls back to 30s previews)
3. **Mobile Playback** - Web Playback SDK doesn't work on mobile browsers
4. **Cold Starts** - Free tier deployments spin down after inactivity

## 🤝 Contributing

This is a personal project, but suggestions and bug reports are welcome!

## 📄 License

ISC License - See LICENSE file for details

## 🙏 Acknowledgments

- Spotify Web API and Web Playback SDK
- React and Vite teams
- Tailwind CSS

---

**Made with ❤️ and 🎵**
