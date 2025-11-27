import { useState, useEffect } from 'react'
import './App.css'
import logo from './assets/logo.svg'

// LocalStorage-based storage for multiplayer across tabs
const mockStorage = {
  async get(key) {
    await new Promise(r => setTimeout(r, 10))
    const value = localStorage.getItem(key)
    return value ? { key, value } : null
  },
  async set(key, value) {
    await new Promise(r => setTimeout(r, 10))
    localStorage.setItem(key, value)
    return { key, value }
  },
  async delete(key) {
    await new Promise(r => setTimeout(r, 10))
    localStorage.removeItem(key)
    return { key, deleted: true }
  }
}

window.storage = {
  get: (key) => mockStorage.get(key),
  set: (key, value) => mockStorage.set(key, value),
  delete: (key) => mockStorage.delete(key)
}

const PLAYLISTS = [
  { id: 'today-top-hits', name: "Today's Top Hits", genre: 'pop', description: 'The hottest tracks' },
  { id: 'rapcaviar', name: 'RapCaviar', genre: 'hip-hop', description: 'New hip hop' },
  { id: 'rock-classics', name: 'Rock Classics', genre: 'rock', description: 'Rock legends' },
  { id: 'indie-pop', name: 'Indie Pop', genre: 'indie', description: 'New indie' },
  { id: 'are-and-be', name: 'Are & Be', genre: 'rnb', description: 'R&B essence' },
  { id: 'hot-country', name: 'Hot Country', genre: 'country', description: 'Country hits' },
  { id: 'mint', name: 'mint', genre: 'electronic', description: 'Dance music' },
  { id: '90s-hits', name: '90s Hits', genre: 'decades', description: 'Best of 90s' },
  { id: '2000s-hits', name: '2000s Hits', genre: 'decades', description: 'Best of 2000s' },
  { id: 'chill-hits', name: 'Chill Hits', genre: 'mood', description: 'Chill vibes' }
]

const SONGS = {
  'today-top-hits': [{ id: 's1', name: 'Anti-Hero', artist: 'Taylor Swift' }, { id: 's2', name: 'Flowers', artist: 'Miley Cyrus' }],
  'rapcaviar': [{ id: 's3', name: 'HUMBLE.', artist: 'Kendrick Lamar' }, { id: 's4', name: 'SICKO MODE', artist: 'Travis Scott' }],
  'rock-classics': [{ id: 's5', name: 'Bohemian Rhapsody', artist: 'Queen' }, { id: 's6', name: "Sweet Child O' Mine", artist: "Guns N' Roses" }],
  'indie-pop': [{ id: 's7', name: 'Electric Feel', artist: 'MGMT' }, { id: 's8', name: 'Take Me Out', artist: 'Franz Ferdinand' }],
  'are-and-be': [{ id: 's9', name: 'Best Part', artist: 'Daniel Caesar' }, { id: 's10', name: 'Redbone', artist: 'Childish Gambino' }],
  'hot-country': [{ id: 's11', name: 'Tennessee Orange', artist: 'Megan Moroney' }, { id: 's12', name: 'Fast Car', artist: 'Luke Combs' }],
  'mint': [{ id: 's13', name: 'Levitating', artist: 'Dua Lipa' }, { id: 's14', name: 'Blinding Lights', artist: 'The Weeknd' }],
  '90s-hits': [{ id: 's15', name: 'Wonderwall', artist: 'Oasis' }, { id: 's16', name: 'Smells Like Teen Spirit', artist: 'Nirvana' }],
  '2000s-hits': [{ id: 's17', name: 'Hey Ya!', artist: 'OutKast' }, { id: 's18', name: 'Mr. Brightside', artist: 'The Killers' }],
  'chill-hits': [{ id: 's19', name: 'Summertime Magic', artist: 'Childish Gambino' }, { id: 's20', name: 'Electric', artist: 'Alina Baraz' }]
}

function App() {
  const [view, setView] = useState('home')
  const [roomCode, setRoomCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [playerId, setPlayerId] = useState(null)
  const [game, setGame] = useState(null)

  useEffect(() => {
    if (roomCode) {
      const interval = setInterval(async () => {
        try {
          const result = await window.storage.get(`game:${roomCode}`)
          if (result) setGame(JSON.parse(result.value))
        } catch (e) {}
      }, 500)
      return () => clearInterval(interval)
    }
  }, [roomCode])

  const genCode = () => Math.random().toString(36).substring(2, 8).toUpperCase()

  const updateGame = async (updates) => {
    // Always read the latest state from storage to avoid stale updates
    const result = await window.storage.get(`game:${roomCode}`)
    const currentGame = result ? JSON.parse(result.value) : game
    const newState = { ...currentGame, ...updates }
    setGame(newState)
    await window.storage.set(`game:${roomCode}`, JSON.stringify(newState))
  }

  const createRoom = async () => {
    const code = genCode()
    const hostId = Date.now().toString()
    const newGame = {
      roomCode: code,
      hostId,
      status: 'lobby',
      players: [],
      djIdx: 0,
      song: null,
      history: [],
      guessesUsed: {}, // Track how many guesses each player has used
      solvedParts: { song: false, artist: false }, // Track what's been correctly guessed
      buzzed: null,
      mode: null,
      playing: false,
      djPickedOwn: false
    }
    await window.storage.set(`game:${code}`, JSON.stringify(newGame))
    setRoomCode(code)
    setPlayerId(hostId)
    setGame(newGame)
    setView('host')
  }

  const joinRoom = async () => {
    if (!joinCode || !playerName) return
    try {
      const result = await window.storage.get(`game:${joinCode.toUpperCase()}`)
      if (result) {
        setPlayerId(Date.now().toString())
        setRoomCode(joinCode.toUpperCase())
        setGame(JSON.parse(result.value))
        setView('player')
      } else alert('Room not found!')
    } catch (e) {
      alert('Room not found!')
    }
  }

  const addPlayer = async (pl) => {
    if (game.players.some(p => p.playlist.id === pl.id)) {
      alert('Playlist already taken!')
      return
    }
    const player = { id: playerId, name: playerName, playlist: pl, score: 0 }
    const idx = game.players.findIndex(p => p.id === playerId)
    const newPlayers = idx >= 0 ? game.players.map((p, i) => i === idx ? player : p) : [...game.players, player]
    await updateGame({ players: newPlayers })
  }

  const startGame = async () => {
    if (game.players.length >= 2) {
      await updateGame({ status: 'playing' })
    } else alert('Need at least 2 players!')
  }

  const selectPlaylist = async (pl) => {
    const dj = game.players[game.djIdx]
    const isDJOwn = pl.id === dj.playlist.id
    const tracks = SONGS[pl.id] || []
    const song = tracks[Math.floor(Math.random() * tracks.length)]
    await updateGame({ 
      history: [...game.history, pl.id], 
      song, 
      playing: true,
      djPickedOwn: isDJOwn
    })
    setTimeout(() => updateGame({ playing: false }), 10000)
  }

  const buzz = (idx) => {
    if (idx === game.djIdx || game.buzzed !== null || !game.song) return
    const key = `p${idx}`
    const used = game.guessesUsed[key] || 0
    // Players can buzz if they have guesses remaining
    if (used < 2) {
      updateGame({ buzzed: idx, playing: false })
    }
  }

  const getOpts = (idx) => {
    const key = `p${idx}`
    const used = game.guessesUsed[key] || 0
    const remaining = 2 - used

    // Show what can still be guessed based on what's already been solved
    return {
      title: !game.solvedParts.song && remaining > 0,
      artist: !game.solvedParts.artist && remaining > 0,
      both: !game.solvedParts.song && !game.solvedParts.artist && remaining > 0,
      remaining
    }
  }

  const judgeGuess = async (correct) => {
    const key = `p${game.buzzed}`
    const newGuessesUsed = { ...game.guessesUsed }
    newGuessesUsed[key] = (newGuessesUsed[key] || 0) + 1

    if (correct && game.mode) {
      // Award points based on what was guessed
      const pts = game.mode === 'both' ? 4 : game.mode === 'title' ? 2 : 1
      const newPlayers = game.players.map((p, i) => {
        if (i === game.buzzed) {
          return { ...p, score: p.score + pts }
        } else if (i === game.djIdx && game.djPickedOwn) {
          return { ...p, score: p.score + 1 }
        }
        return p
      })

      // Mark what parts have been solved
      const newSolvedParts = { ...game.solvedParts }
      if (game.mode === 'both') {
        newSolvedParts.song = true
        newSolvedParts.artist = true
      } else if (game.mode === 'title') {
        newSolvedParts.song = true
      } else if (game.mode === 'artist') {
        newSolvedParts.artist = true
      }

      // Check if both parts are now solved
      if (newSolvedParts.song && newSolvedParts.artist) {
        // Round complete! Move to next round
        await nextRound(newPlayers)
      } else {
        // Continue playing - only part of the answer is solved
        await updateGame({
          players: newPlayers,
          solvedParts: newSolvedParts,
          guessesUsed: newGuessesUsed,
          buzzed: null,
          mode: null,
          playing: true
        })
      }
    } else {
      // Incorrect guess - check if everyone's out of guesses
      const allPlayersOutOfGuesses = game.players.every((p, idx) => {
        if (idx === game.djIdx) return true
        const playerKey = `p${idx}`
        const used = newGuessesUsed[playerKey] || 0
        return used >= 2
      })

      if (allPlayersOutOfGuesses) {
        // Nobody can guess anymore - DJ gets penalty, next round
        const newPlayers = game.players.map((p, i) =>
          i === game.djIdx ? { ...p, score: Math.max(0, p.score - 1) } : p
        )
        await nextRound(newPlayers)
      } else {
        // Continue playing
        await updateGame({
          guessesUsed: newGuessesUsed,
          buzzed: null,
          mode: null,
          playing: true
        })
      }
    }
  }

  const nextRound = async (updatedPlayers = null) => {
    const players = updatedPlayers || game.players
    const winner = players.find(p => p.score >= 20)
    if (winner) {
      await updateGame({ status: 'gameOver', players })
    } else {
      await updateGame({
        djIdx: (game.djIdx + 1) % players.length,
        song: null,
        buzzed: null,
        mode: null,
        playing: false,
        guessesUsed: {},
        solvedParts: { song: false, artist: false },
        players,
        djPickedOwn: false
      })
    }
  }

  const skipRound = async () => {
    // DJ always gets -1 penalty when no one guesses correctly
    const newPlayers = game.players.map((p, i) =>
      i === game.djIdx ? { ...p, score: Math.max(0, p.score - 1) } : p
    )
    await nextRound(newPlayers)
  }

  const getAvail = () => {
    if (!game?.players) return []

    // Calculate how many rounds to block based on number of players
    // For N players, block playlist for Math.floor(N/2) rounds
    // 2-3 players: 1 round (no consecutive), 4-5: 2 rounds, 6-7: 3 rounds, 8-9: 4 rounds
    const numPlayers = game.players.length
    const blockedRounds = Math.max(1, Math.floor(numPlayers / 2))

    return game.players.map(p => p.playlist).filter(pl => {
      const recentHistory = game.history.slice(-blockedRounds)
      return !recentHistory.includes(pl.id)
    })
  }

  // HOME
  if (view === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black p-6 flex items-center justify-center relative overflow-hidden">
        {/* Ambient glow effects */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-500/20 rounded-full blur-3xl"></div>

        <div className="max-w-2xl w-full relative z-10">
          {/* Logo & Title */}
          <div className="text-center mb-12">
            {/* Custom SVG Logo */}
            <div className="relative inline-block mb-8">
              <div className="animate-spin-slow">
                <img src={logo} alt="Musical Wheelhouse" className="w-56 h-56 drop-shadow-2xl" />
              </div>
            </div>

            <h1 className="text-6xl md:text-7xl font-black text-white mb-2 tracking-tight">MUSICAL</h1>
            <h2 className="text-7xl md:text-8xl font-black bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 bg-clip-text text-transparent tracking-tight">WHEELHOUSE</h2>
          </div>

          {/* Action Cards */}
          <div className="space-y-4">
            {/* Host Card */}
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-white/20">
              <h3 className="text-xl font-bold text-amber-400 mb-4 text-center uppercase tracking-wide">Host a Game</h3>
              <button
                onClick={createRoom}
                className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-gray-900 py-5 rounded-xl font-black text-xl shadow-lg shadow-amber-500/50 transform hover:scale-[1.02] transition"
              >
                START NEW GAME
              </button>
            </div>

            {/* Join Card */}
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-white/20">
              <h3 className="text-xl font-bold text-purple-300 mb-4 text-center uppercase tracking-wide">Join a Game</h3>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Your Name"
                className="w-full px-6 py-4 rounded-xl bg-white/5 text-white placeholder-white/40 border border-white/20 focus:border-purple-400 focus:outline-none mb-3 font-medium backdrop-blur-sm"
              />
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ROOM CODE"
                className="w-full px-6 py-4 rounded-xl bg-white/5 text-white placeholder-white/30 border border-white/20 focus:border-purple-400 focus:outline-none uppercase tracking-widest text-center text-2xl font-bold mb-4 backdrop-blur-sm"
                maxLength={6}
              />
              <button
                onClick={joinRoom}
                disabled={!joinCode || !playerName}
                className="w-full bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 disabled:from-gray-700 disabled:to-gray-800 disabled:cursor-not-allowed text-white py-5 rounded-xl font-black text-xl shadow-lg shadow-purple-500/50 transform hover:scale-[1.02] transition disabled:transform-none disabled:shadow-none"
              >
                JOIN GAME
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!game) return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black flex items-center justify-center">
      <div className="text-white text-3xl font-bold">Loading...</div>
    </div>
  )

  // HOST LOBBY
  if (view === 'host' && game.status === 'lobby') {
    const hostPlayer = game.players.find(p => p.id === playerId)
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black p-6 relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>

        <div className="max-w-2xl mx-auto pt-8 relative z-10">
          {/* Room Code Display */}
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 mb-6 text-center shadow-2xl border border-white/20">
            <h2 className="text-sm font-bold text-amber-400 mb-3 uppercase tracking-widest">Room Code</h2>
            <div className="relative inline-block">
              <div className="bg-gradient-to-r from-amber-500 to-yellow-600 text-gray-900 text-6xl font-black tracking-widest py-4 px-8 rounded-xl shadow-lg shadow-amber-500/50">
                {roomCode}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(roomCode)}
                className="absolute -top-2 -right-2 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white w-10 h-10 rounded-full shadow-lg flex items-center justify-center transform hover:scale-110 transition border border-white/30"
                title="Copy room code"
              >
                📋
              </button>
            </div>
            <p className="text-white/60 mt-4 font-medium text-sm">Share this code with players</p>
          </div>

          {/* Host Playlist Selection */}
          {!hostPlayer && (
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 mb-6 shadow-2xl border border-white/20">
              <h3 className="text-xl font-bold text-purple-300 mb-4 text-center uppercase tracking-wide">Choose Your Playlist</h3>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Your name"
                className="w-full px-4 py-3 rounded-lg bg-white/5 text-white placeholder-white/40 border border-white/20 focus:border-purple-400 focus:outline-none mb-4 font-medium backdrop-blur-sm"
              />
              <div className="space-y-2">
                {PLAYLISTS.slice(0, 5).map(pl => (
                  <button
                    key={pl.id}
                    onClick={() => addPlayer(pl)}
                    className="w-full text-left p-4 rounded-xl bg-gradient-to-r from-purple-600/80 to-fuchsia-600/80 hover:from-purple-500 hover:to-fuchsia-500 text-white shadow-md shadow-purple-500/30 transform hover:scale-[1.02] transition backdrop-blur-sm border border-white/10"
                  >
                    <div className="font-bold text-lg">{pl.name}</div>
                    <div className="text-sm text-white/90">{pl.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Players List */}
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 mb-6 shadow-2xl border border-white/20">
            <h3 className="text-xl font-bold text-white mb-4 uppercase tracking-wide">
              Players <span className="text-amber-400">({game.players.length})</span>
            </h3>
            {game.players.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🎵</div>
                <p className="text-white/40 text-lg">Waiting for players to join...</p>
              </div>
            ) : (
              <div className="space-y-3">
                {game.players.map((p, idx) => (
                  <div
                    key={p.id}
                    className={`rounded-xl p-4 flex justify-between items-center ${
                      p.id === playerId
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-600 shadow-lg shadow-amber-500/30'
                        : 'bg-white/5 border border-white/10 backdrop-blur-sm'
                    }`}
                  >
                    <div>
                      <span className={`font-bold text-lg ${p.id === playerId ? 'text-gray-900' : 'text-white'}`}>
                        {p.name} {p.id === playerId && '(Host)'}
                      </span>
                    </div>
                    <span className={`text-sm font-semibold px-3 py-1 rounded-full ${p.id === playerId ? 'bg-black/20' : 'bg-purple-500/30 text-purple-200'}`}>
                      {p.playlist.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Start Button */}
          {game.players.length >= 2 && (
            <button
              onClick={startGame}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white py-6 rounded-2xl font-black text-2xl shadow-2xl shadow-green-500/50 transform hover:scale-[1.02] transition"
            >
              START GAME! 🎵
            </button>
          )}
        </div>
      </div>
    )
  }

  // PLAYER LOBBY
  if (view === 'player' && game.status === 'lobby') {
    const joined = game.players.some(p => p.id === playerId)
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black p-6 relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="max-w-md mx-auto pt-8 relative z-10">
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 mb-6 text-center shadow-2xl border border-white/20">
            <h2 className="text-sm font-bold text-amber-400 mb-2 uppercase tracking-widest">Room Code</h2>
            <div className="text-4xl font-black text-white tracking-widest mb-3">{roomCode}</div>
            <p className="text-white/80 font-semibold text-lg">Welcome, {playerName}!</p>
          </div>

          {!joined ? (
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-white/20">
              <h3 className="text-xl font-bold text-purple-300 mb-4 text-center uppercase tracking-wide">Choose Your Playlist</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {PLAYLISTS.map(pl => {
                  const taken = game.players.some(p => p.playlist.id === pl.id)
                  return (
                    <button
                      key={pl.id}
                      onClick={() => !taken && addPlayer(pl)}
                      disabled={taken}
                      className={`w-full text-left p-4 rounded-xl ${
                        taken
                          ? 'bg-white/5 opacity-40 cursor-not-allowed border border-white/10'
                          : 'bg-gradient-to-r from-purple-600/80 to-fuchsia-600/80 hover:from-purple-500 hover:to-fuchsia-500 shadow-md shadow-purple-500/30 transform hover:scale-[1.02] transition border border-white/10'
                      } text-white backdrop-blur-sm`}
                    >
                      <div className="font-bold text-lg">{pl.name}</div>
                      <div className="text-sm text-white/90">
                        {pl.description} {taken && '• Already Taken'}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 text-center shadow-2xl border border-white/20">
              <div className="text-6xl mb-4">✅</div>
              <h3 className="text-3xl font-black text-green-400 mb-3">You're In!</h3>
              <p className="text-white/70 mb-6 font-medium text-lg">Waiting for host to start the game...</p>
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <h4 className="text-sm font-bold text-amber-400 mb-3 uppercase tracking-widest">Players</h4>
                <div className="space-y-2">
                  {game.players.map(p => (
                    <div
                      key={p.id}
                      className={`rounded-lg p-3 font-semibold ${
                        p.id === playerId
                          ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-gray-900 shadow-lg shadow-amber-500/30'
                          : 'bg-white/5 border border-white/10 text-white backdrop-blur-sm'
                      }`}
                    >
                      {p.name} {p.id === playerId && '(You)'}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // PLAYING SCREENS
  if (game.status === 'playing') {
    const dj = game.players[game.djIdx]
    const me = game.players.find(p => p.id === playerId)
    const myIdx = game.players.findIndex(p => p.id === playerId)
    const isDJ = myIdx === game.djIdx
    const avail = getAvail()

    // DJ VIEW
    if (isDJ) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black p-6 relative overflow-hidden">
          {/* Ambient glow */}
          <div className="absolute top-1/4 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 left-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>

          <div className="max-w-md mx-auto pt-8 relative z-10">
            {/* Scoreboard */}
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 mb-4 shadow-2xl border border-white/20">
              <h3 className="text-sm font-bold text-amber-400 mb-3 uppercase tracking-widest text-center">Scores</h3>
              <div className="grid grid-cols-2 gap-2">
                {game.players.map((p, idx) => (
                  <div
                    key={p.id}
                    className={`rounded-lg p-2 flex justify-between items-center ${
                      idx === game.djIdx
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-600 shadow-lg shadow-amber-500/30'
                        : 'bg-white/5 border border-white/10 backdrop-blur-sm'
                    }`}
                  >
                    <span className={`font-bold text-sm truncate ${idx === game.djIdx ? 'text-gray-900' : 'text-white'}`}>
                      {p.name}
                    </span>
                    <span className={`font-black text-lg ${idx === game.djIdx ? 'text-gray-900' : 'text-white'}`}>
                      {p.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* DJ Badge */}
            <div className="bg-gradient-to-r from-amber-500 to-yellow-600 rounded-2xl p-6 mb-6 text-center shadow-2xl shadow-amber-500/50 border-4 border-amber-400">
              <div className="text-5xl mb-2">🎧</div>
              <h2 className="text-3xl font-black text-gray-900">YOU'RE THE DJ!</h2>
              <p className="text-gray-800 font-semibold mt-1">
                {!game.song ? 'Pick a playlist to play' : 'Judge the guesses'}
              </p>
            </div>

            {!game.song ? (
              <div className="space-y-3">
                {avail.map(pl => (
                  <button
                    key={pl.id}
                    onClick={() => selectPlaylist(pl)}
                    className="w-full bg-white/10 backdrop-blur-xl hover:bg-white/20 text-left p-5 rounded-2xl shadow-lg shadow-purple-500/20 transform hover:scale-[1.02] transition border border-white/20 hover:border-purple-400"
                  >
                    <div className="font-black text-xl text-white">{pl.name}</div>
                    <div className="text-sm text-white/70 font-medium mt-1">
                      by {game.players.find(p => p.playlist.id === pl.id)?.name}
                    </div>
                    {pl.id === me.playlist.id && (
                      <div className="text-amber-300 text-xs font-bold mt-2 bg-amber-900/30 px-3 py-1 rounded-full inline-block border border-amber-500/50">
                        ⚠️ Your playlist: Automatic +1 pt bonus!
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : game.buzzed !== null && game.mode ? (
              // Full-screen judging interface
              <div className="fixed inset-0 z-50 flex flex-col">
                {/* Top Half - INCORRECT (Red) */}
                <button
                  onClick={() => judgeGuess(false)}
                  className="flex-1 bg-gradient-to-b from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 active:from-red-700 active:to-red-800 flex flex-col items-center justify-center text-white transition cursor-pointer"
                >
                  <div className="text-9xl mb-4">✗</div>
                  <div className="text-5xl font-black">INCORRECT</div>
                </button>

                {/* Middle Info Bar */}
                <div className="bg-white py-6 px-8 shadow-2xl">
                  <div className="max-w-2xl mx-auto">
                    <div className="text-center mb-4">
                      <div className="text-2xl font-black text-gray-900 mb-2">
                        {game.players[game.buzzed].name} guessing {game.mode.toUpperCase()}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-4 border-2 border-gray-200">
                      <div className="grid grid-cols-2 gap-4 text-center">
                        <div>
                          <div className="text-sm font-bold text-gray-500 mb-1">SONG</div>
                          <div className="text-xl font-black text-gray-900">{game.song.name}</div>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-500 mb-1">ARTIST</div>
                          <div className="text-xl font-black text-gray-900">{game.song.artist}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Half - CORRECT (Green) */}
                <button
                  onClick={() => judgeGuess(true)}
                  className="flex-1 bg-gradient-to-t from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 active:from-green-700 active:to-green-800 flex flex-col items-center justify-center text-white transition cursor-pointer"
                >
                  <div className="text-9xl mb-4">✓</div>
                  <div className="text-5xl font-black">CORRECT</div>
                </button>
              </div>
            ) : (
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 text-center shadow-2xl border border-white/20">
                <div className="text-7xl mb-4">{game.playing ? '🎵' : '⏸️'}</div>
                <div className="text-3xl font-black text-white mb-2">
                  {game.playing ? 'Playing Now!' : 'Paused'}
                </div>
                <p className="text-white/70 font-medium mb-6">Waiting for players to buzz in...</p>
                <button
                  onClick={skipRound}
                  className="bg-white/10 hover:bg-white/20 text-white px-8 py-3 rounded-xl font-bold shadow-md border border-white/20 transform hover:scale-[1.02] transition backdrop-blur-sm"
                >
                  Skip Round
                </button>
              </div>
            )}
          </div>
        </div>
      )
    }

    // GUESSER VIEW
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black p-6 relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute top-1/3 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/3 left-0 w-96 h-96 bg-fuchsia-500/10 rounded-full blur-3xl"></div>

        <div className="max-w-md mx-auto pt-8 relative z-10">
          {/* Scoreboard */}
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 mb-4 shadow-2xl border border-white/20">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-widest">Scores</h3>
              <div className="text-xs font-bold text-white/60">DJ: {dj.name}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {game.players.map((p, idx) => (
                <div
                  key={p.id}
                  className={`rounded-lg p-2 flex justify-between items-center ${
                    idx === myIdx
                      ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-500/30'
                      : idx === game.djIdx
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-gray-900 shadow-lg shadow-amber-500/30'
                      : 'bg-white/5 border border-white/10 text-white backdrop-blur-sm'
                  }`}
                >
                  <span className={`font-bold text-sm truncate ${idx === myIdx || idx === game.djIdx ? (idx === myIdx ? 'text-white' : 'text-gray-900') : 'text-white'}`}>
                    {p.name} {idx === myIdx && '(You)'}
                  </span>
                  <span className={`font-black text-lg ${idx === myIdx || idx === game.djIdx ? (idx === myIdx ? 'text-white' : 'text-gray-900') : 'text-white'}`}>
                    {p.score}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {!game.song ? (
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-12 text-center shadow-2xl border border-white/20">
              <div className="text-7xl mb-4">🎵</div>
              <p className="text-2xl font-bold text-white">Waiting for DJ...</p>
            </div>
          ) : game.buzzed === null ? (
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-white/20">
              <div className="text-center mb-6">
                <div className="text-8xl mb-4">{game.playing ? '🎵' : '⏸️'}</div>
                <div className="text-3xl text-white font-black mb-2">
                  {game.playing ? 'Listen!' : 'Paused'}
                </div>
                <p className="text-white/70 font-medium">
                  {getOpts(myIdx).remaining > 0 ? `${getOpts(myIdx).remaining} guess${getOpts(myIdx).remaining === 1 ? '' : 'es'} remaining` : 'No guesses left'}
                </p>
                {game.solvedParts.song || game.solvedParts.artist ? (
                  <div className="mt-2 text-sm font-bold text-emerald-400">
                    {game.solvedParts.song && '✓ Song guessed'} {game.solvedParts.artist && '✓ Artist guessed'}
                  </div>
                ) : null}
              </div>
              <button
                onClick={() => buzz(myIdx)}
                disabled={getOpts(myIdx).remaining === 0}
                className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 disabled:from-gray-700 disabled:to-gray-800 disabled:cursor-not-allowed text-white py-20 rounded-2xl font-black text-5xl shadow-2xl shadow-emerald-500/50 transform hover:scale-[1.02] transition disabled:transform-none disabled:opacity-50"
              >
                {getOpts(myIdx).remaining === 0 ? 'No Guesses Left' : '⚡ BUZZ IN!'}
              </button>
            </div>
          ) : game.buzzed === myIdx ? (
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border border-white/20">
              <div className="text-center mb-6">
                <div className="text-6xl mb-3">⚡</div>
                <h3 className="text-3xl font-black text-white">You Buzzed!</h3>
              </div>
              {!game.mode ? (
                <div className="space-y-3">
                  {getOpts(myIdx).title && (
                    <button
                      onClick={() => updateGame({ mode: 'title' })}
                      className="w-full bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white py-6 rounded-xl font-black text-xl shadow-lg shadow-purple-500/50 transform hover:scale-[1.02] transition"
                    >
                      🎵 Song Title <span className="text-amber-300">(2 pts)</span>
                    </button>
                  )}
                  {getOpts(myIdx).artist && (
                    <button
                      onClick={() => updateGame({ mode: 'artist' })}
                      className="w-full bg-gradient-to-r from-fuchsia-600 to-pink-700 hover:from-fuchsia-500 hover:to-pink-600 text-white py-6 rounded-xl font-black text-xl shadow-lg shadow-fuchsia-500/50 transform hover:scale-[1.02] transition"
                    >
                      🎤 Artist <span className="text-amber-300">(1 pt)</span>
                    </button>
                  )}
                  {getOpts(myIdx).both && (
                    <button
                      onClick={() => updateGame({ mode: 'both' })}
                      className="w-full bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-gray-900 py-6 rounded-xl font-black text-xl shadow-lg shadow-amber-500/50 transform hover:scale-[1.02] transition"
                    >
                      🎯 Both <span className="text-gray-900">(4 pts!)</span>
                    </button>
                  )}
                  <button
                    onClick={() => updateGame({ buzzed: null, mode: null, playing: true })}
                    className="w-full bg-white/5 hover:bg-white/10 border border-white/20 text-white py-4 rounded-xl font-bold shadow-md backdrop-blur-sm transition"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div>
                  <div className="bg-gradient-to-r from-fuchsia-600 to-violet-700 rounded-xl p-8 mb-5 text-white shadow-lg shadow-fuchsia-500/30 text-center">
                    <div className="text-6xl mb-4">🎤</div>
                    <div className="font-black mb-3 text-3xl">
                      You're guessing {game.mode === 'both' ? 'BOTH' : game.mode === 'title' ? 'SONG TITLE' : 'ARTIST'}!
                    </div>
                    <div className="text-lg font-bold text-white/80">
                      {game.mode === 'both' ? '4 points' : game.mode === 'title' ? '2 points' : '1 point'}
                    </div>
                  </div>
                  <div className="bg-amber-500/20 border-2 border-amber-500 rounded-xl p-5 text-center backdrop-blur-sm">
                    <p className="text-amber-300 font-black text-xl mb-2">Say your answer out loud!</p>
                    <p className="text-white/80 font-medium">DJ will judge if you're correct</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-12 text-center shadow-2xl border border-white/20">
              <div className="text-6xl mb-4">⏳</div>
              <p className="text-2xl font-bold text-white">{game.players[game.buzzed].name} is guessing...</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // GAME OVER
  if (game.status === 'gameOver') {
    const winner = game.players.reduce((max, p) => p.score > max.score ? p : max)
    const sortedPlayers = [...game.players].sort((a, b) => b.score - a.score)
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black p-6 flex items-center justify-center relative overflow-hidden">
        {/* Ambient glow effects */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"></div>

        <div className="max-w-md w-full relative z-10">
          {/* Winner Card */}
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-10 text-center shadow-2xl border border-white/20 mb-6">
            <div className="text-9xl mb-4">🏆</div>
            <h1 className="text-5xl font-black text-white mb-2">WINNER!</h1>
            <div className="bg-gradient-to-r from-amber-500 to-yellow-600 text-gray-900 text-4xl font-black py-4 px-6 rounded-2xl inline-block mb-3 shadow-lg shadow-amber-500/50">
              {winner.name}
            </div>
            <div className="text-white/60 font-bold text-xl">
              {winner.score} points
            </div>
          </div>

          {/* Leaderboard */}
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-6 shadow-2xl border border-white/20">
            <h3 className="text-2xl font-black text-white mb-5 text-center">Final Scores</h3>
            <div className="space-y-3">
              {sortedPlayers.map((p, i) => (
                <div
                  key={p.id}
                  className={`rounded-xl p-4 flex justify-between items-center ${
                    i === 0
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-600 shadow-lg shadow-amber-500/50 border-2 border-amber-400'
                      : i === 1
                      ? 'bg-gradient-to-r from-gray-400 to-gray-500 shadow-lg shadow-gray-500/30 border-2 border-gray-300'
                      : i === 2
                      ? 'bg-gradient-to-r from-orange-500 to-amber-600 shadow-lg shadow-orange-500/30 border-2 border-orange-400'
                      : 'bg-white/5 border border-white/10 backdrop-blur-sm'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-3xl font-black ${i < 3 ? 'text-gray-900' : 'text-white'}`}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </span>
                    <span className={`font-bold text-xl ${i < 3 ? 'text-gray-900' : 'text-white'}`}>
                      {p.name}
                    </span>
                  </div>
                  <span className={`font-black text-2xl ${i < 3 ? 'text-gray-900' : 'text-white'}`}>
                    {p.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}

export default App