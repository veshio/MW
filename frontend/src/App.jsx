import { useState, useEffect } from 'react'
import './App.css'
import logo from './assets/logo.svg'
import { apiClient } from './services/apiClient'
import { audioPlayer } from './services/audioPlayer'
import { authService } from './services/authService'
import { spotifyPlayer } from './services/spotifyPlayer'
import { spotifyConnect } from './services/spotifyConnect'

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

// Mock data removed - now fetched from Spotify API via backend

function App() {
  const [view, setView] = useState('home')
  const [roomCode, setRoomCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [playerId, setPlayerId] = useState(null)
  const [game, setGame] = useState(null)

  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Spotify API state
  const [playlists, setPlaylists] = useState([])
  const [loadingPlaylists, setLoadingPlaylists] = useState(false)
  const [playlistTracks, setPlaylistTracks] = useState({}) // Cache tracks by playlistId
  const [playerReady, setPlayerReady] = useState(false)
  const [currentlyPlayingUri, setCurrentlyPlayingUri] = useState(null)

  // Spotify Connect API state (for mobile browsers)
  const [availableDevices, setAvailableDevices] = useState([])
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [useConnectAPI, setUseConnectAPI] = useState(false)
  const [loadingDevices, setLoadingDevices] = useState(false)

  // Handle OAuth callback and check authentication on mount
  useEffect(() => {
    const handleAuth = async () => {
      // Check for session token in URL (OAuth callback)
      const urlParams = new URLSearchParams(window.location.search)
      const sessionToken = urlParams.get('session')
      const error = urlParams.get('error')

      if (error) {
        alert('Authentication failed. Please try again.')
        window.history.replaceState({}, document.title, window.location.pathname)
        setAuthLoading(false)
        return
      }

      if (sessionToken) {
        try {
          const userData = await authService.handleCallback(sessionToken)
          setUser(userData)
          setIsAuthenticated(true)
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname)

          // Check if user was trying to host a game before login
          const hostIntent = localStorage.getItem('host_intent')
          if (hostIntent === 'true') {
            localStorage.removeItem('host_intent')
            // Small delay to ensure state is updated
            setTimeout(() => {
              createRoom(true) // Pass true to skip auth check
            }, 100)
          }
        } catch (error) {
          console.error('Failed to handle OAuth callback:', error)
          alert('Failed to complete login. Please try again.')
        }
      } else {
        // Check if already authenticated
        const authenticated = authService.isAuthenticated()
        setIsAuthenticated(authenticated)
        if (authenticated) {
          setUser(authService.getUser())
        }
      }

      setAuthLoading(false)
    }

    handleAuth()
  }, [])

  // Initialize Spotify Web Playback SDK for authenticated users
  useEffect(() => {
    const initPlayer = async () => {
      if (isAuthenticated && !playerReady) {
        try {
          console.log('Initializing Spotify Web Playback SDK...')
          const accessToken = await apiClient.getAccessToken()
          await spotifyPlayer.initialize(accessToken)
          setPlayerReady(true)
          setUseConnectAPI(false) // SDK worked, don't use Connect API
          console.log('✓ Spotify Player ready (Web Playback SDK)')
        } catch (error) {
          console.warn('Web Playback SDK failed (likely mobile browser), will use Connect API:', error)
          setPlayerReady(false)
          setUseConnectAPI(true) // SDK failed, use Connect API
        }
      }
    }

    initPlayer()
  }, [isAuthenticated])

  // Fetch available Spotify devices for Connect API (mobile browsers)
  useEffect(() => {
    const fetchDevices = async () => {
      if (isAuthenticated && useConnectAPI && !loadingDevices) {
        setLoadingDevices(true)
        try {
          const sessionToken = authService.getSessionToken()
          const response = await spotifyConnect.getDevices(sessionToken)
          if (response.devices && response.devices.length > 0) {
            setAvailableDevices(response.devices)
            // Auto-select first active device, or first device if none active
            const activeDevice = response.devices.find(d => d.is_active)
            setSelectedDevice(activeDevice || response.devices[0])
            console.log('✓ Devices loaded:', response.devices.length)
          } else {
            console.log('No Spotify devices available. Please open Spotify on a device.')
          }
        } catch (error) {
          console.error('Failed to fetch devices:', error)
        } finally {
          setLoadingDevices(false)
        }
      }
    }

    fetchDevices()
  }, [isAuthenticated, useConnectAPI])

  // Playlists will be loaded when room is created/joined, not automatically on auth

  const handleLogin = async () => {
    try {
      await authService.login()
    } catch (error) {
      console.error('Login failed:', error)
      alert('Failed to initiate login. Please try again.')
    }
  }

  const handleLogout = async () => {
    try {
      await authService.logout()
      spotifyPlayer.disconnect()
      setIsAuthenticated(false)
      setUser(null)
      setPlaylists([])
      setPlayerReady(false)
      setView('home')
      setGame(null)
      setRoomCode('')
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  const loadPlaylists = async () => {
    setLoadingPlaylists(true)
    try {
      // If we already have playlists in the game state (non-host players), use those
      if (game?.playlists && game.playlists.length > 0) {
        console.log(`✓ Using ${game.playlists.length} playlists from game state`)
        setPlaylists(game.playlists)
        setLoadingPlaylists(false)
        return
      }

      // Host fetches playlists from Spotify
      const data = await apiClient.fetchPlaylists()
      setPlaylists(data)
      console.log(`✓ Loaded ${data.length} playlists from Spotify`)

      // Store playlists in game state so non-host players can access them
      if (game && game.hostId === playerId) {
        await updateGame({ playlists: data })
      }
    } catch (error) {
      console.error('Failed to load playlists:', error)
      alert('Failed to load playlists from Spotify. Make sure the backend is running!')
    } finally {
      setLoadingPlaylists(false)
    }
  }

  const loadPlaylistTracks = async (playlistId) => {
    // Return cached tracks if available
    if (playlistTracks[playlistId]) {
      return playlistTracks[playlistId]
    }

    try {
      const tracks = await apiClient.fetchPlaylistTracks(playlistId)
      setPlaylistTracks(prev => ({ ...prev, [playlistId]: tracks }))
      console.log(`✓ Loaded ${tracks.length} tracks from playlist ${playlistId}`)
      return tracks
    } catch (error) {
      console.error(`Failed to load tracks for playlist ${playlistId}:`, error)
      throw error
    }
  }

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

  // Synchronized audio playback - ONLY ON HOST DEVICE
  useEffect(() => {
    // Only the host plays music (has Spotify Premium)
    const isHost = game && playerId === game.hostId

    console.log('🎧 Playback effect triggered:', {
      isHost,
      hasPlayback: !!game?.playback,
      isPlaying: game?.playback?.isPlaying,
      playerReady,
      currentlyPlayingUri,
      trackUri: game?.playback?.trackUri
    })

    if (!game?.playback) {
      if (isHost && playerReady) {
        spotifyPlayer.stop()
      }
      setCurrentlyPlayingUri(null)
      return
    }

    const { trackUri, previewUrl, startedAt, isPlaying } = game.playback

    if (isPlaying && isHost) {
      const now = Date.now()
      const elapsed = now - startedAt

      console.log('⏱️ Playback timing:', { elapsed, trackUri, currentlyPlayingUri, match: trackUri === currentlyPlayingUri })

      // Only play if we're within the 30-second window AND we haven't started this track yet
      if (elapsed < 30000 && elapsed >= 0 && trackUri !== currentlyPlayingUri) {
        // Route to Web Playback SDK (desktop) or Connect API (mobile)
        if (playerReady && !useConnectAPI && trackUri) {
          // Desktop: Use Web Playback SDK (embedded in browser)
          const remainingMs = 30000 - elapsed
          setCurrentlyPlayingUri(trackUri)
          console.log(`🎵 HOST playing track via Web Playback SDK: ${trackUri}, remaining: ${remainingMs}ms`)
          spotifyPlayer.playTrack(trackUri, remainingMs).catch(err => {
            console.error('❌ Spotify playback failed:', err)
          })
        } else if (useConnectAPI && selectedDevice && trackUri) {
          // Mobile: Use Connect API (control external device)
          setCurrentlyPlayingUri(trackUri)
          console.log(`🎵 HOST playing track via Connect API on device: ${selectedDevice.name}`)
          const sessionToken = authService.getSessionToken()
          spotifyConnect.play(sessionToken, trackUri, selectedDevice.id).catch(err => {
            console.error('❌ Connect API playback failed:', err)
          })
        } else {
          console.log('⚠️ Cannot play - playerReady:', playerReady, 'useConnectAPI:', useConnectAPI, 'selectedDevice:', selectedDevice, 'trackUri:', trackUri)
        }
      } else {
        console.log('⏭️ Skipping playback - elapsed:', elapsed, 'already playing:', trackUri === currentlyPlayingUri)
      }
    } else if (!isPlaying && isHost) {
      console.log('⏸️ Pausing playback')
      if (playerReady && !useConnectAPI) {
        // Desktop: Pause Web Playback SDK
        spotifyPlayer.pause()
      } else if (useConnectAPI && selectedDevice) {
        // Mobile: Pause via Connect API
        const sessionToken = authService.getSessionToken()
        spotifyConnect.pause(sessionToken, selectedDevice.id).catch(err => {
          console.error('❌ Connect API pause failed:', err)
        })
      }
      // Reset currentlyPlayingUri so the track can be replayed
      setCurrentlyPlayingUri(null)
    }
  }, [game?.playback, playerReady, currentlyPlayingUri, playerId, game?.hostId, useConnectAPI, selectedDevice])

  const genCode = () => Math.random().toString(36).substring(2, 8).toUpperCase()

  // Start countdown and then play music
  const startCountdown = async () => {
    console.log('🎬 Starting countdown...')
    const result = await window.storage.get(`game:${roomCode}`)
    const currentGame = result ? JSON.parse(result.value) : game

    await updateGame({ countdown: 3, playing: false, playback: { ...currentGame.playback, isPlaying: false } })
    await new Promise(r => setTimeout(r, 1000))
    await updateGame({ countdown: 2, playing: false, playback: { ...currentGame.playback, isPlaying: false } })
    await new Promise(r => setTimeout(r, 1000))
    await updateGame({ countdown: 1, playing: false, playback: { ...currentGame.playback, isPlaying: false } })
    await new Promise(r => setTimeout(r, 1000))

    // Get fresh playback state and set isPlaying to true, update startedAt for proper sync
    const result2 = await window.storage.get(`game:${roomCode}`)
    const currentGame2 = result2 ? JSON.parse(result2.value) : game
    console.log('🎵 Countdown complete - starting playback!')
    await updateGame({
      countdown: null,
      playing: true,
      playback: {
        ...currentGame2.playback,
        isPlaying: true,
        startedAt: Date.now() // Reset start time for proper sync
      }
    })
  }

  const updateGame = async (updates) => {
    // Always read the latest state from storage to avoid stale updates
    const result = await window.storage.get(`game:${roomCode}`)
    const currentGame = result ? JSON.parse(result.value) : game
    const newState = { ...currentGame, ...updates }
    setGame(newState)
    await window.storage.set(`game:${roomCode}`, JSON.stringify(newState))
  }

  const createRoom = async (skipAuthCheck = false) => {
    console.log('createRoom called - skipAuthCheck:', skipAuthCheck, 'isAuthenticated:', isAuthenticated)
    // Host must be authenticated to create room (unless called from OAuth callback)
    if (!skipAuthCheck) {
      if (!isAuthenticated) {
        console.log('User not authenticated, initiating login...')
        // Store intent to host after login
        localStorage.setItem('host_intent', 'true')
        // Initiate login flow
        try {
          console.log('Calling authService.login()...')
          await authService.login()
          console.log('Login initiated, should redirect to Spotify')
          return // Login will redirect, so return here
        } catch (error) {
          console.error('Login failed:', error)
          localStorage.removeItem('host_intent')
          alert(`Failed to log in with Spotify.\n\nError: ${error.message}\n\nPlease check console for details.`)
          return
        }
      } else {
        // Validate session is still valid on backend
        console.log('Validating session with backend...')
        const isValid = await authService.validateSession()
        if (!isValid) {
          console.log('Session invalid, re-authenticating...')
          setIsAuthenticated(false)
          setUser(null)
          // Store intent and trigger login
          localStorage.setItem('host_intent', 'true')
          try {
            await authService.login()
            return
          } catch (error) {
            console.error('Login failed:', error)
            localStorage.removeItem('host_intent')
            alert(`Failed to log in with Spotify.\n\nError: ${error.message}\n\nPlease check console for details.`)
            return
          }
        }
      }
    }

    console.log('Creating room (authenticated or skipping auth check)...')

    const code = genCode()
    const hostId = Date.now().toString()
    const newGame = {
      roomCode: code,
      hostId,
      status: 'lobby',
      players: [],
      playlists: [], // Shared playlists for all players
      djIdx: 0,
      song: null,
      history: [],
      guessesUsed: {}, // Track how many guesses each player has used
      solvedParts: { song: false, artist: false }, // Track what's been correctly guessed
      buzzed: null,
      mode: null,
      playing: false,
      countdown: null,
      djPickedOwn: false,
      anyoneGuessedCorrectly: false
    }
    await window.storage.set(`game:${code}`, JSON.stringify(newGame))
    setRoomCode(code)
    setPlayerId(hostId)
    setGame(newGame)
    setView('host')
    // Load playlists now that we're hosting
    loadPlaylists()
  }

  const joinRoom = async () => {
    if (!joinCode || !playerName) return
    try {
      const result = await window.storage.get(`game:${joinCode.toUpperCase()}`)
      if (result) {
        setPlayerId(Date.now().toString())
        setRoomCode(joinCode.toUpperCase())
        const gameData = JSON.parse(result.value)
        setGame(gameData)
        setView('player')
        // Load playlists from game state (non-host doesn't fetch from Spotify)
        loadPlaylists()
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
    // Stop any currently playing music first
    if (game.playback?.isPlaying) {
      await updateGame({
        playback: { ...game.playback, isPlaying: false },
        playing: false
      })
    }

    const dj = game.players[game.djIdx]
    const isDJOwn = pl.id === dj.playlist.id

    try {
      // Fetch tracks from Spotify API
      const tracks = await loadPlaylistTracks(pl.id)

      if (!tracks || tracks.length === 0) {
        alert('⚠️ No tracks found in this playlist!')
        return
      }

      // Pick random track
      const song = tracks[Math.floor(Math.random() * tracks.length)]

      // Award DJ +1 point immediately if they picked their own playlist
      const newPlayers = isDJOwn
        ? game.players.map((p, i) => i === game.djIdx ? { ...p, score: p.score + 1 } : p)
        : game.players

      await updateGame({
        history: [...game.history, pl.id],
        song,
        selectedPlaylist: { id: pl.id, name: pl.name }, // Track which playlist is playing
        playback: {
          trackUri: song.uri, // For Web Playback SDK
          previewUrl: song.previewUrl, // Fallback for non-Premium
          startedAt: Date.now(),
          isPlaying: false, // Start paused, countdown will start it
          duration: 30000 // 30 seconds
        },
        playing: false, // Start paused
        djPickedOwn: isDJOwn,
        players: newPlayers,
        anyoneGuessedCorrectly: false // Track if anyone guessed correctly this round
      })

      // Start countdown then play
      await startCountdown()

      // Auto-stop after 30 seconds
      setTimeout(async () => {
        const result = await window.storage.get(`game:${roomCode}`)
        const currentGame = result ? JSON.parse(result.value) : game
        if (currentGame.playback?.isPlaying) {
          await updateGame({
            playback: { ...currentGame.playback, isPlaying: false },
            playing: false
          })
        }
      }, 30000)
    } catch (error) {
      console.error('Error selecting playlist:', error)
      alert('Failed to load song from playlist. Try another one!')
    }
  }

  const buzz = (idx) => {
    if (idx === game.djIdx || game.buzzed !== null || !game.song) return
    const key = `p${idx}`
    const used = game.guessesUsed[key] || 0
    // Players can buzz if they have guesses remaining
    if (used < 2) {
      updateGame({
        buzzed: idx,
        playing: false,
        playback: { ...game.playback, isPlaying: false }
      })
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
        // Round complete! Someone guessed correctly - move to next round
        await nextRound(newPlayers, true) // true = someone guessed correctly
      } else {
        // Partial answer correct - restart with countdown
        await updateGame({
          players: newPlayers,
          solvedParts: newSolvedParts,
          guessesUsed: newGuessesUsed,
          buzzed: null,
          mode: null,
          playing: false,
          playback: { ...game.playback, isPlaying: false },
          anyoneGuessedCorrectly: true // Mark that someone guessed correctly
        })
        // Restart countdown then play
        await startCountdown()
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
        // Nobody can guess anymore - DJ gets penalty if no one guessed correctly
        const djPenalty = !game.anyoneGuessedCorrectly
        const newPlayers = djPenalty
          ? game.players.map((p, i) => i === game.djIdx ? { ...p, score: Math.max(0, p.score - 1) } : p)
          : game.players
        await nextRound(newPlayers, game.anyoneGuessedCorrectly)
      } else {
        // Continue playing - restart with countdown
        await updateGame({
          guessesUsed: newGuessesUsed,
          buzzed: null,
          mode: null,
          playing: false,
          playback: { ...game.playback, isPlaying: false }
        })
        // Restart countdown then play
        await startCountdown()
      }
    }
  }

  const nextRound = async (updatedPlayers = null, someoneGuessedCorrectly = false) => {
    const players = updatedPlayers || game.players
    const winner = players.find(p => p.score >= 20)

    // Stop music before switching DJ
    if (game.playback?.isPlaying) {
      await updateGame({
        playback: { ...game.playback, isPlaying: false },
        playing: false
      })
    }

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
        djPickedOwn: false,
        anyoneGuessedCorrectly: false,
        playback: null // Clear playback state
      })
    }
  }

  const skipRound = async () => {
    // DJ gets -1 penalty when skipping (no one guessed correctly)
    const djPenalty = !game.anyoneGuessedCorrectly
    const newPlayers = djPenalty
      ? game.players.map((p, i) => i === game.djIdx ? { ...p, score: Math.max(0, p.score - 1) } : p)
      : game.players
    await nextRound(newPlayers, game.anyoneGuessedCorrectly)
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

  // Loading screen while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin-slow mb-6">
            <img src={logo} alt="Musical Wheelhouse" className="w-32 h-32 drop-shadow-2xl" />
          </div>
          <div className="text-white text-2xl font-bold">Loading...</div>
        </div>
      </div>
    )
  }

  // HOME
  if (view === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-950 p-6 flex items-center justify-center relative overflow-hidden">
        {/* Premium gradient mesh background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-600/20 via-transparent to-transparent"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-sky-600/20 via-transparent to-transparent"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-transparent via-rose-600/10 to-transparent"></div>

        {/* Animated floating orbs - Premium blur effects */}
        <div className="absolute top-20 left-10 w-40 h-40 bg-gradient-to-br from-orange-400 to-rose-500 rounded-full opacity-30 blur-3xl animate-bounce" style={{animationDuration: '3s'}}></div>
        <div className="absolute top-40 right-20 w-56 h-56 bg-gradient-to-br from-sky-400 to-blue-500 rounded-full opacity-25 blur-3xl animate-pulse" style={{animationDuration: '4s'}}></div>
        <div className="absolute bottom-32 left-1/4 w-48 h-48 bg-gradient-to-br from-rose-400 to-pink-500 rounded-full opacity-30 blur-3xl animate-bounce" style={{animationDuration: '5s', animationDelay: '1s'}}></div>
        <div className="absolute bottom-20 right-1/3 w-52 h-52 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full opacity-25 blur-3xl animate-pulse" style={{animationDuration: '3.5s', animationDelay: '0.5s'}}></div>

        <div className="max-w-2xl w-full relative z-10">
          {/* User Info & Logout - Premium Glassmorphism */}
          {isAuthenticated && user && (
            <div className="group bg-white/5 backdrop-blur-2xl rounded-2xl p-4 mb-6 flex justify-between items-center border border-white/10 shadow-2xl shadow-sky-500/10 animate-fadeIn relative overflow-hidden">
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-sky-500/10 via-blue-500/5 to-transparent opacity-50 group-hover:opacity-70 transition-opacity"></div>

              <div className="flex items-center gap-3 relative z-10">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white font-black shadow-xl shadow-sky-500/50 ring-2 ring-white/20">
                  {user.displayName?.[0]?.toUpperCase()}
                </div>
                <div>
                  <div className="text-white font-bold">{user.displayName}</div>
                  <div className="text-sky-300 text-sm font-medium flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                    Spotify Connected
                  </div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="relative z-10 bg-white/10 hover:bg-white/15 backdrop-blur-sm text-white px-4 py-2 rounded-lg font-semibold text-sm border border-white/20 hover:border-white/30 transition-all hover:scale-105 shadow-lg"
              >
                Logout
              </button>
            </div>
          )}

          {/* Logo & Title - Electric Music Vibes */}
          <div className="text-center mb-12">
            {/* Animated Logo */}
            <div className="relative inline-block mb-8 animate-fadeIn">
              <div className="animate-spin-slow hover:animate-spin transition-all duration-500">
                <div className="relative">
                  <img src={logo} alt="Musical Wheelhouse" className="w-32 h-32 sm:w-48 sm:h-48 md:w-56 md:h-56 drop-shadow-2xl transform hover:scale-110 transition-transform duration-300" />
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-500/30 to-sky-500/30 rounded-full blur-3xl animate-pulse"></div>
                </div>
              </div>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-white mb-2 tracking-tight animate-slideDown drop-shadow-[0_0_20px_rgba(249,115,22,0.4)]">MUSICAL</h1>
            <h2 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black bg-gradient-to-r from-orange-500 via-rose-500 to-sky-500 bg-clip-text text-transparent tracking-tight animate-slideUp drop-shadow-[0_0_35px_rgba(251,146,60,0.5)]">WHEELHOUSE</h2>
            <div className="mt-4 text-sky-400 font-bold text-lg sm:text-xl animate-fadeIn drop-shadow-[0_0_15px_rgba(56,189,248,0.7)]" style={{animationDelay: '0.5s'}}>🎸 Guess That Tune! 🎸</div>
          </div>

          {/* Action Cards - Premium Glassmorphism */}
          <div className="space-y-5">
            {/* Host Card */}
            <div className="group relative bg-white/5 backdrop-blur-2xl rounded-3xl p-8 shadow-2xl border border-white/10 hover:border-orange-400/50 transition-all duration-300 overflow-hidden">
              {/* Animated gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-rose-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

              <div className="relative z-10">
                <h3 className="text-xl font-bold text-orange-400 mb-5 text-center uppercase tracking-wide drop-shadow-[0_0_15px_rgba(251,146,60,0.8)]">Host a Game</h3>
                <button
                  onClick={() => createRoom()}
                  className="w-full bg-gradient-to-r from-orange-500 via-rose-500 to-rose-600 hover:from-orange-400 hover:via-rose-400 hover:to-rose-500 text-white py-5 rounded-xl font-black text-xl shadow-xl shadow-orange-500/50 hover:shadow-orange-400/60 transform hover:scale-[1.02] transition-all duration-200 relative overflow-hidden group/btn"
                >
                  <span className="relative z-10">START NEW GAME</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700"></div>
                </button>
                {!isAuthenticated && (
                  <p className="text-gray-400 text-sm mt-4 text-center font-medium">
                    You'll need to log in with Spotify to host
                  </p>
                )}
              </div>
            </div>

            {/* Join Card */}
            <div className="group relative bg-white/5 backdrop-blur-2xl rounded-3xl p-8 shadow-2xl border border-white/10 hover:border-sky-400/50 transition-all duration-300 overflow-hidden">
              {/* Animated gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

              <div className="relative z-10">
                <h3 className="text-xl font-bold text-sky-400 mb-5 text-center uppercase tracking-wide drop-shadow-[0_0_15px_rgba(56,189,248,0.8)]">Join a Game</h3>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full px-6 py-4 rounded-xl bg-white/10 backdrop-blur-sm text-white placeholder-white/40 border border-white/20 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/50 focus:bg-white/15 focus:outline-none mb-3 font-medium transition-all"
                />
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ROOM CODE"
                  className="w-full px-6 py-4 rounded-xl bg-white/10 backdrop-blur-sm text-white placeholder-white/30 border border-white/20 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/50 focus:bg-white/15 focus:outline-none uppercase tracking-widest text-center text-2xl font-bold mb-4 transition-all"
                  maxLength={6}
                />
                <button
                  onClick={joinRoom}
                  disabled={!joinCode || !playerName}
                  className="w-full bg-gradient-to-r from-sky-500 via-blue-500 to-blue-600 hover:from-sky-400 hover:via-blue-400 hover:to-blue-500 disabled:from-gray-700 disabled:to-gray-800 disabled:cursor-not-allowed disabled:opacity-50 text-white py-5 rounded-xl font-black text-xl shadow-xl shadow-sky-500/50 hover:shadow-sky-400/60 transform hover:scale-[1.02] transition-all duration-200 relative overflow-hidden group/btn"
                >
                  <span className="relative z-10">JOIN GAME</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700"></div>
                </button>
                <p className="text-gray-400 text-sm mt-4 text-center font-medium">
                  No Spotify account needed to join
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!game) return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-950 flex items-center justify-center">
      <div className="text-white text-3xl font-bold">Loading...</div>
    </div>
  )

  // HOST LOBBY
  if (view === 'host' && game.status === 'lobby') {
    const hostPlayer = game.players.find(p => p.id === playerId)
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-950 p-6 relative overflow-hidden">
        {/* Premium gradient mesh background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-600/15 via-transparent to-transparent"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-sky-600/15 via-transparent to-transparent"></div>

        {/* Animated orbs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-orange-400 to-rose-500 rounded-full opacity-20 blur-3xl animate-pulse" style={{animationDuration: '4s'}}></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-br from-sky-400 to-blue-500 rounded-full opacity-20 blur-3xl animate-pulse" style={{animationDuration: '5s'}}></div>

        <div className="max-w-2xl mx-auto pt-8 relative z-10">
          {/* Room Code Display - Premium */}
          <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 mb-6 text-center shadow-2xl border border-white/10 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-rose-500/5 to-transparent"></div>
            <h2 className="relative z-10 text-sm font-bold text-orange-400 mb-4 uppercase tracking-widest drop-shadow-[0_0_10px_rgba(251,146,60,0.6)]">Room Code</h2>
            <div className="relative inline-block z-10">
              <div className="bg-gradient-to-r from-orange-500 via-rose-500 to-rose-600 text-white text-4xl sm:text-5xl md:text-6xl font-black tracking-widest py-3 px-6 sm:py-4 sm:px-8 rounded-2xl shadow-2xl shadow-orange-500/50 ring-2 ring-white/20">
                {roomCode}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(roomCode)}
                className="absolute -top-2 -right-2 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white w-10 h-10 rounded-full shadow-lg flex items-center justify-center transform hover:scale-110 transition border border-white/30"
                title="Copy room code"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            <p className="text-white/60 mt-4 font-medium text-sm">Share this code with players</p>
          </div>

          {/* Device Selector - Show for host when using Connect API (mobile browsers) */}
          {useConnectAPI && availableDevices.length > 0 && (
            <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl p-6 mb-6 shadow-2xl border border-white/10 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-indigo-500/5 to-transparent"></div>
              <h3 className="relative z-10 text-xl font-bold text-purple-400 mb-4 text-center uppercase tracking-wide drop-shadow-[0_0_10px_rgba(168,85,247,0.6)]">Select Playback Device</h3>
              <p className="relative z-10 text-white/60 text-sm mb-4 text-center">
                Choose which device will play music during the game
              </p>
              <div className="relative z-10 space-y-2 max-h-64 overflow-y-auto no-scrollbar">
                {availableDevices.map(device => (
                  <button
                    key={device.id}
                    onClick={() => setSelectedDevice(device)}
                    className={`w-full p-4 rounded-xl transition-all duration-200 ${
                      selectedDevice?.id === device.id
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/30'
                        : 'bg-white/5 text-white/80 hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-left">
                        <div className="font-semibold">{device.name}</div>
                        <div className="text-sm opacity-75">{device.type}</div>
                      </div>
                      {device.is_active && (
                        <span className="text-xs bg-green-500/80 px-2 py-1 rounded-full font-semibold">Active</span>
                      )}
                      {selectedDevice?.id === device.id && !device.is_active && (
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={async () => {
                  setLoadingDevices(true)
                  try {
                    const sessionToken = authService.getSessionToken()
                    const response = await spotifyConnect.getDevices(sessionToken)
                    if (response.devices) {
                      setAvailableDevices(response.devices)
                      const activeDevice = response.devices.find(d => d.is_active)
                      if (activeDevice) setSelectedDevice(activeDevice)
                    }
                  } catch (error) {
                    console.error('Failed to refresh devices:', error)
                  } finally {
                    setLoadingDevices(false)
                  }
                }}
                disabled={loadingDevices}
                className="relative z-10 mt-4 w-full text-sm text-purple-400 hover:text-purple-300 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingDevices ? 'Refreshing...' : '🔄 Refresh Devices'}
              </button>
            </div>
          )}

          {/* No devices warning - show when Connect API is needed but no devices */}
          {useConnectAPI && availableDevices.length === 0 && !loadingDevices && (
            <div className="relative bg-yellow-500/10 backdrop-blur-2xl rounded-3xl p-6 mb-6 shadow-2xl border border-yellow-500/30 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-orange-500/5 to-transparent"></div>
              <div className="relative z-10 text-center">
                <svg className="w-12 h-12 mx-auto mb-3 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-lg font-bold text-yellow-400 mb-2">No Spotify Devices Found</h3>
                <p className="text-white/80 text-sm mb-4">
                  Please open Spotify on your phone, computer, or speaker, then refresh.
                </p>
                <button
                  onClick={async () => {
                    setLoadingDevices(true)
                    try {
                      const sessionToken = authService.getSessionToken()
                      const response = await spotifyConnect.getDevices(sessionToken)
                      if (response.devices) {
                        setAvailableDevices(response.devices)
                        const activeDevice = response.devices.find(d => d.is_active)
                        if (activeDevice) setSelectedDevice(activeDevice)
                      }
                    } catch (error) {
                      console.error('Failed to refresh devices:', error)
                    } finally {
                      setLoadingDevices(false)
                    }
                  }}
                  disabled={loadingDevices}
                  className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingDevices ? 'Refreshing...' : 'Refresh Devices'}
                </button>
              </div>
            </div>
          )}

          {/* Host Name Input - Premium */}
          {!hostPlayer && (
            <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl p-6 mb-6 shadow-2xl border border-white/10 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-rose-500/5 to-transparent"></div>
              <h3 className="relative z-10 text-xl font-bold text-orange-400 mb-4 text-center uppercase tracking-wide drop-shadow-[0_0_10px_rgba(251,146,60,0.6)]">Enter Your Name</h3>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Your name"
                className="relative z-10 w-full px-6 py-4 rounded-xl bg-white/10 backdrop-blur-sm text-white placeholder-white/40 border border-white/20 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/50 focus:bg-white/15 focus:outline-none font-medium transition-all"
              />
            </div>
          )}

          {/* Host Playlist Selection - Premium */}
          {!hostPlayer && (
            <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl p-6 mb-6 shadow-2xl border border-white/10 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-transparent"></div>
              <h3 className="relative z-10 text-xl font-bold text-sky-400 mb-5 text-center uppercase tracking-wide drop-shadow-[0_0_10px_rgba(56,189,248,0.6)]">Choose Your Playlist</h3>
              <div className="relative z-10 space-y-3 max-h-96 overflow-y-auto no-scrollbar">
                {loadingPlaylists ? (
                  <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 text-center border border-white/10">
                    <div className="w-12 h-12 mx-auto mb-3 border-4 border-sky-400 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-white/70 font-medium">Loading playlists from Spotify...</p>
                  </div>
                ) : playlists.length === 0 ? (
                  <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 text-center border border-white/10">
                    <svg className="w-12 h-12 mx-auto mb-3 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <p className="text-white/70 font-medium">No playlists available</p>
                    <button onClick={loadPlaylists} className="mt-3 text-orange-400 hover:text-orange-300 font-semibold transition-colors">
                      Retry
                    </button>
                  </div>
                ) : (
                  (() => {
                    // Group playlists by genre
                    const grouped = playlists.reduce((acc, pl) => {
                      const genre = pl.genre || 'other';
                      if (!acc[genre]) acc[genre] = [];
                      acc[genre].push(pl);
                      return acc;
                    }, {});

                    return Object.entries(grouped).map(([genre, genrePlaylists]) => (
                      <div key={genre} className="mb-4">
                        <h4 className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-2 px-2 drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]">
                          {genre}
                        </h4>
                        <div className="space-y-2">
                          {genrePlaylists.map(pl => (
                            <button
                              key={pl.id}
                              onClick={() => addPlayer(pl)}
                              className="group w-full text-left p-4 rounded-xl bg-white/5 backdrop-blur-sm hover:bg-white/10 text-white shadow-lg hover:shadow-sky-500/30 transition-all duration-200 border border-white/10 hover:border-sky-400/50 relative overflow-hidden"
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-sky-500/0 via-sky-500/10 to-sky-500/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                              <div className="relative z-10">
                                <div className="font-bold text-base mb-1">{pl.name}</div>
                                <div className="text-xs text-white/60">{pl.description}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ));
                  })()
                )}
              </div>
            </div>
          )}

          {/* Players List - Premium */}
          <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl p-6 mb-6 shadow-2xl border border-white/10 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 via-orange-500/5 to-transparent"></div>
            <h3 className="relative z-10 text-xl font-bold text-white mb-4 uppercase tracking-wide drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
              Players <span className="text-orange-400">({game.players.length})</span>
            </h3>
            {game.players.length === 0 ? (
              <div className="relative z-10 text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 border-4 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-white/40 text-lg">Waiting for players to join...</p>
              </div>
            ) : (
              <div className="relative z-10 space-y-3">
                {game.players.map((p, idx) => (
                  <div
                    key={p.id}
                    className={`rounded-xl p-4 flex justify-between items-center ${
                      p.id === playerId
                        ? 'bg-gradient-to-r from-orange-500 to-rose-600 shadow-lg shadow-orange-500/30 text-white'
                        : 'bg-white/5 border border-white/10 backdrop-blur-sm'
                    }`}
                  >
                    <div>
                      <span className={`font-bold text-lg ${p.id === playerId ? 'text-white' : 'text-white'}`}>
                        {p.name} {p.id === playerId && '(Host)'}
                      </span>
                    </div>
                    <span className={`text-sm font-semibold px-3 py-1 rounded-full ${p.id === playerId ? 'bg-white/20' : 'bg-sky-500/30 text-sky-200'}`}>
                      {p.playlist.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Start Button - Premium */}
          {game.players.length >= 2 && (
            <button
              onClick={startGame}
              className="group w-full bg-gradient-to-r from-sky-500 via-blue-600 to-sky-600 hover:from-sky-400 hover:via-blue-500 hover:to-sky-500 text-white py-6 rounded-2xl font-black text-2xl shadow-2xl shadow-sky-500/50 hover:shadow-sky-400/60 transform hover:scale-[1.02] transition-all duration-200 relative overflow-hidden"
            >
              <span className="relative z-10">START GAME!</span>
              {/* Shimmer effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
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
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-950 p-6 relative overflow-hidden">
        {/* Premium gradient mesh background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-600/15 via-transparent to-transparent"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-sky-600/15 via-transparent to-transparent"></div>

        {/* Animated orbs */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-orange-400 to-rose-500 rounded-full opacity-20 blur-3xl animate-pulse" style={{animationDuration: '4s'}}></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-br from-sky-400 to-blue-500 rounded-full opacity-20 blur-3xl animate-pulse" style={{animationDuration: '5s'}}></div>

        <div className="max-w-md mx-auto pt-8 relative z-10">
          {/* Room Code Display - Premium */}
          <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl p-6 mb-6 text-center shadow-2xl border border-white/10 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-rose-500/5 to-transparent"></div>
            <h2 className="relative z-10 text-sm font-bold text-orange-400 mb-2 uppercase tracking-widest drop-shadow-[0_0_10px_rgba(251,146,60,0.6)]">Room Code</h2>
            <div className="relative z-10 text-4xl font-black text-white tracking-widest mb-3">{roomCode}</div>
            <p className="relative z-10 text-white/80 font-semibold text-lg">Welcome, {playerName}!</p>
          </div>

          {!joined ? (
            <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl p-6 shadow-2xl border border-white/10 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-transparent"></div>
              <h3 className="relative z-10 text-xl font-bold text-sky-400 mb-5 text-center uppercase tracking-wide drop-shadow-[0_0_10px_rgba(56,189,248,0.6)]">Choose Your Playlist</h3>
              <div className="relative z-10 space-y-3 max-h-96 overflow-y-auto no-scrollbar">
                {loadingPlaylists ? (
                  <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 text-center border border-white/10">
                    <div className="w-12 h-12 mx-auto mb-3 border-4 border-sky-400 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-white/70 font-medium">Loading playlists from Spotify...</p>
                  </div>
                ) : (
                  (() => {
                    // Group playlists by genre
                    const grouped = playlists.reduce((acc, pl) => {
                      const genre = pl.genre || 'other';
                      if (!acc[genre]) acc[genre] = [];
                      acc[genre].push(pl);
                      return acc;
                    }, {});

                    return Object.entries(grouped).map(([genre, genrePlaylists]) => (
                      <div key={genre} className="mb-4">
                        <h4 className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-2 px-2 drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]">
                          {genre}
                        </h4>
                        <div className="space-y-2">
                          {genrePlaylists.map(pl => {
                            const taken = game.players.some(p => p.playlist.id === pl.id);
                            return (
                              <button
                                key={pl.id}
                                onClick={() => !taken && addPlayer(pl)}
                                disabled={taken}
                                className={`group w-full text-left p-4 rounded-xl text-white shadow-lg transition-all duration-200 border relative overflow-hidden ${
                                  taken
                                  ? 'bg-white/5 opacity-40 cursor-not-allowed border-white/10'
                                  : 'bg-white/5 backdrop-blur-sm hover:bg-white/10 hover:shadow-sky-500/30 border-white/10 hover:border-sky-400/50'
                                }`}
                              >
                                {!taken && (
                                  <div className="absolute inset-0 bg-gradient-to-r from-sky-500/0 via-sky-500/10 to-sky-500/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                )}
                                <div className="relative z-10">
                                  <div className="font-bold text-base mb-1">{pl.name}</div>
                                  <div className="text-xs text-white/60">
                                    {pl.description} {taken && '• Already Taken'}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()
                )}
              </div>
            </div>
          ) : (
            <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl p-8 text-center shadow-2xl border border-white/10 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-transparent"></div>
              <div className="relative z-10">
                <svg className="w-16 h-16 mx-auto mb-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
                <h3 className="text-3xl font-black text-sky-400 mb-3 drop-shadow-[0_0_15px_rgba(56,189,248,0.8)]">You're In!</h3>
                <p className="text-white/70 mb-6 font-medium text-lg">Waiting for host to start the game...</p>
                <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                  <h4 className="text-sm font-bold text-orange-400 mb-3 uppercase tracking-widest drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]">Players</h4>
                  <div className="space-y-2">
                    {game.players.map(p => (
                      <div
                        key={p.id}
                        className={`rounded-xl p-3 font-semibold ${
                          p.id === playerId
                            ? 'bg-gradient-to-r from-orange-500 to-rose-600 text-white shadow-lg shadow-orange-500/30'
                            : 'bg-white/5 border border-white/10 text-white backdrop-blur-sm'
                        }`}
                      >
                        {p.name} {p.id === playerId && '(You)'}
                      </div>
                    ))}
                  </div>
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
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-950 p-6 relative overflow-hidden">
          {/* Premium gradient mesh background */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-600/15 via-transparent to-transparent"></div>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-rose-600/15 via-transparent to-transparent"></div>

          {/* Animated orbs */}
          <div className="absolute top-1/4 right-0 w-96 h-96 bg-gradient-to-br from-orange-400 to-rose-500 rounded-full opacity-20 blur-3xl animate-pulse" style={{animationDuration: '4s'}}></div>
          <div className="absolute bottom-1/4 left-0 w-96 h-96 bg-gradient-to-br from-rose-400 to-orange-500 rounded-full opacity-20 blur-3xl animate-pulse" style={{animationDuration: '5s'}}></div>

          <div className="max-w-md mx-auto pt-8 relative z-10">
            {/* Scoreboard - Premium */}
            <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl p-4 mb-4 shadow-2xl border border-white/10 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-rose-500/5 to-transparent"></div>
              <h3 className="relative z-10 text-sm font-bold text-orange-400 mb-3 uppercase tracking-widest text-center drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]">Scores</h3>
              <div className="relative z-10 grid grid-cols-2 gap-2">
                {game.players.map((p, idx) => (
                  <div
                    key={p.id}
                    className={`rounded-xl p-2 flex justify-between items-center ${
                      idx === game.djIdx
                        ? 'bg-gradient-to-r from-orange-500 to-rose-600 shadow-lg shadow-orange-500/30 text-white'
                        : 'bg-white/5 border border-white/10 backdrop-blur-sm'
                    }`}
                  >
                    <span className={`font-bold text-sm truncate ${idx === game.djIdx ? 'text-white' : 'text-white'}`}>
                      {p.name}
                    </span>
                    <span className={`font-black text-lg ${idx === game.djIdx ? 'text-white' : 'text-white'}`}>
                      {p.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* DJ Badge - Premium */}
            <div className="relative bg-gradient-to-r from-orange-500 to-rose-600 rounded-3xl p-6 mb-6 text-center shadow-2xl shadow-orange-500/50 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
              <div className="relative z-10">
                <h2 className="text-3xl font-black text-white drop-shadow-lg">YOU'RE THE DJ!</h2>
                <p className="text-white/90 font-semibold mt-1">
                  {!game.song ? 'Pick a playlist to play' : 'Judge the guesses'}
                </p>
              </div>
            </div>

            {!game.song ? (
              <div className="space-y-3">
                {avail.map(pl => (
                  <button
                    key={pl.id}
                    onClick={() => selectPlaylist(pl)}
                    className="group w-full text-left p-5 rounded-2xl bg-white/5 backdrop-blur-sm hover:bg-white/10 text-white shadow-lg hover:shadow-sky-500/30 transform hover:scale-[1.01] transition-all duration-200 border border-white/10 hover:border-sky-400/50 relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-sky-500/0 via-sky-500/10 to-sky-500/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="relative z-10">
                      <div className="font-black text-xl text-white">{pl.name}</div>
                      <div className="text-sm text-white/70 font-medium mt-1">
                        by {game.players.find(p => p.playlist.id === pl.id)?.name}
                      </div>
                      {pl.id === me.playlist.id && (
                        <div className="flex items-center gap-1.5 text-orange-300 text-xs font-bold mt-2 bg-orange-900/30 px-3 py-1 rounded-full inline-block border border-orange-500/50">
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          Your playlist: Automatic +1 pt bonus!
                        </div>
                      )}
                    </div>
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
                  <svg className="w-32 h-32 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M6 18L18 6M6 6l12 12" />
                  </svg>
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
                  <svg className="w-32 h-32 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                  </svg>
                  <div className="text-5xl font-black">CORRECT</div>
                </button>
              </div>
            ) : (
              <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl p-8 text-center shadow-2xl border border-white/10 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-transparent"></div>

                {/* Playlist Info Banner - Premium */}
                {game.selectedPlaylist && (
                  <div className="relative z-10 mb-6 bg-gradient-to-r from-sky-500/20 to-blue-600/20 backdrop-blur-sm rounded-2xl p-4 border border-sky-400/30 shadow-lg shadow-sky-500/20">
                    <div className="text-xs font-bold text-sky-300 uppercase tracking-widest mb-1 drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]">Now Playing From</div>
                    <div className="text-lg font-black text-white drop-shadow-lg">{game.selectedPlaylist.name}</div>
                  </div>
                )}

                <div className="relative z-10">
                  {game.countdown !== null && game.countdown !== undefined ? (
                    <>
                      <div className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl mb-4 font-black text-white animate-pulse drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">{game.countdown}</div>
                      <div className="text-3xl font-black text-white mb-2 drop-shadow-lg">Get Ready!</div>
                    </>
                  ) : (
                    <>
                      <div className="inline-block p-6 bg-sky-500/20 rounded-full mb-4 animate-pulse">
                        <svg className="w-16 h-16 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                      </div>
                      <div className="text-3xl font-black text-white mb-2 drop-shadow-lg">Playing Now!</div>
                    </>
                  )}
                  {game.buzzed !== null ? (
                    <p className="text-white font-bold text-2xl mb-6 drop-shadow-lg flex items-center justify-center gap-2">
                      <svg className="w-6 h-6 text-orange-400 animate-bounce" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                      </svg>
                      {game.players[game.buzzed].name} buzzed in!
                    </p>
                  ) : (
                    <p className="text-white/70 font-medium mb-6">Waiting for players to buzz in...</p>
                  )}

                  {/* Premium icon buttons */}
                  <div className="flex gap-3 justify-center items-center">
                    <button
                      onClick={startCountdown}
                      className="group relative w-14 h-14 rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 hover:from-orange-400 hover:to-rose-500 shadow-lg hover:shadow-orange-500/50 transition-all duration-200 hover:scale-105 flex items-center justify-center overflow-hidden"
                      title="Replay"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                      <svg className="w-6 h-6 text-white relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                    <button
                      onClick={skipRound}
                      className="group relative w-14 h-14 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 shadow-lg hover:shadow-sky-500/50 transition-all duration-200 hover:scale-105 flex items-center justify-center overflow-hidden"
                      title="Skip Round"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                      <svg className="w-6 h-6 text-white relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )
    }

    // GUESSER VIEW
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-950 p-6 relative overflow-hidden">
        {/* Premium gradient mesh background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-sky-600/15 via-transparent to-transparent"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-blue-600/15 via-transparent to-transparent"></div>

        {/* Animated orbs */}
        <div className="absolute top-1/3 right-0 w-96 h-96 bg-gradient-to-br from-sky-400 to-blue-500 rounded-full opacity-20 blur-3xl animate-pulse" style={{animationDuration: '4s'}}></div>
        <div className="absolute bottom-1/3 left-0 w-96 h-96 bg-gradient-to-br from-blue-400 to-sky-500 rounded-full opacity-20 blur-3xl animate-pulse" style={{animationDuration: '5s'}}></div>

        <div className="max-w-md mx-auto pt-8 relative z-10">
          {/* Scoreboard - Premium */}
          <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl p-4 mb-4 shadow-2xl border border-white/10 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-transparent"></div>
            <div className="relative z-10 flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-sky-400 uppercase tracking-widest drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]">Scores</h3>
              <div className="text-xs font-bold text-white/60">DJ: {dj.name}</div>
            </div>
            <div className="relative z-10 grid grid-cols-2 gap-2">
              {game.players.map((p, idx) => (
                <div
                  key={p.id}
                  className={`rounded-xl p-2 flex justify-between items-center ${
                    idx === myIdx
                      ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30'
                      : idx === game.djIdx
                      ? 'bg-gradient-to-r from-orange-500 to-rose-600 text-white shadow-lg shadow-orange-500/30'
                      : 'bg-white/5 border border-white/10 text-white backdrop-blur-sm'
                  }`}
                >
                  <span className={`font-bold text-sm truncate text-white`}>
                    {p.name} {idx === myIdx && '(You)'}
                  </span>
                  <span className={`font-black text-lg text-white`}>
                    {p.score}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {!game.song ? (
            <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl p-8 sm:p-10 md:p-12 text-center shadow-2xl border border-white/10 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-transparent"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 border-4 border-sky-400 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xl sm:text-2xl font-bold text-white drop-shadow-lg">Waiting for DJ...</p>
              </div>
            </div>
          ) : game.buzzed === null ? (
            <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl p-6 shadow-2xl border border-white/10 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-transparent"></div>

              {/* Playlist Info Banner - Premium */}
              {game.selectedPlaylist && (
                <div className="relative z-10 mb-4 bg-gradient-to-r from-sky-500/20 to-blue-600/20 backdrop-blur-sm rounded-2xl p-3 border border-sky-400/30 shadow-lg shadow-sky-500/20">
                  <div className="text-xs font-bold text-sky-300 uppercase tracking-widest drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]">Now Playing From</div>
                  <div className="text-sm font-black text-white drop-shadow-lg">{game.selectedPlaylist.name}</div>
                </div>
              )}

              <div className="relative z-10 text-center mb-6">
                {game.countdown !== null && game.countdown !== undefined ? (
                  <>
                    <div className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl mb-4 font-black text-white animate-pulse drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">{game.countdown}</div>
                    <div className="text-3xl text-white font-black mb-2 drop-shadow-lg">Get Ready!</div>
                  </>
                ) : (
                  <>
                    <div className="inline-block p-6 bg-sky-500/20 rounded-full mb-4 animate-pulse">
                      <svg className="w-20 h-20 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                    </div>
                    <div className="text-3xl text-white font-black mb-2 drop-shadow-lg">Listen!</div>
                  </>
                )}
                <p className="text-white/70 font-medium">
                  {getOpts(myIdx).remaining > 0 ? `${getOpts(myIdx).remaining} guess${getOpts(myIdx).remaining === 1 ? '' : 'es'} remaining` : 'No guesses left'}
                </p>
                <p className="text-white/50 text-xs mt-2 flex items-center justify-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                  </svg>
                  Music playing on host device
                </p>
                {game.solvedParts.song || game.solvedParts.artist ? (
                  <div className="mt-2 text-sm font-bold text-sky-400 drop-shadow-lg flex items-center justify-center gap-2">
                    {game.solvedParts.song && (
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        Song guessed
                      </span>
                    )}
                    {game.solvedParts.artist && (
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        Artist guessed
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
              <button
                onClick={() => buzz(myIdx)}
                disabled={getOpts(myIdx).remaining === 0}
                className="group relative z-10 w-full bg-gradient-to-r from-rose-500 to-orange-600 hover:from-rose-400 hover:to-orange-500 disabled:from-gray-700 disabled:to-gray-800 disabled:cursor-not-allowed text-white py-12 sm:py-16 md:py-20 rounded-2xl font-black text-3xl sm:text-4xl md:text-5xl shadow-2xl shadow-rose-500/50 hover:shadow-rose-400/60 transform hover:scale-[1.02] transition disabled:transform-none disabled:opacity-50 overflow-hidden"
              >
                <span className="relative z-10 flex items-center justify-center gap-2 sm:gap-3">
                  {getOpts(myIdx).remaining > 0 && (
                    <svg className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                    </svg>
                  )}
                  {getOpts(myIdx).remaining === 0 ? 'No Guesses Left' : 'BUZZ IN!'}
                </span>
                {getOpts(myIdx).remaining > 0 && (
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                )}
              </button>
            </div>
          ) : game.buzzed === myIdx ? (
            <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl p-6 shadow-2xl border border-white/10 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-transparent"></div>
              <div className="relative z-10 text-center mb-6">
                <div className="inline-block p-4 bg-orange-500/20 rounded-full mb-3">
                  <svg className="w-16 h-16 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-3xl font-black text-white drop-shadow-lg">You Buzzed!</h3>
              </div>
              {!game.mode ? (
                <div className="relative z-10 space-y-3">
                  {getOpts(myIdx).title && (
                    <button
                      onClick={() => updateGame({ mode: 'title' })}
                      className="group w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white py-6 rounded-xl font-black text-xl shadow-lg shadow-sky-500/50 hover:shadow-sky-400/60 transform hover:scale-[1.02] transition overflow-hidden relative"
                    >
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                        Song Title <span className="text-orange-300">(2 pts)</span>
                      </span>
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                    </button>
                  )}
                  {getOpts(myIdx).artist && (
                    <button
                      onClick={() => updateGame({ mode: 'artist' })}
                      className="group w-full bg-gradient-to-r from-blue-500 to-sky-600 hover:from-blue-400 hover:to-sky-500 text-white py-6 rounded-xl font-black text-xl shadow-lg shadow-blue-500/50 hover:shadow-blue-400/60 transform hover:scale-[1.02] transition overflow-hidden relative"
                    >
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        Artist <span className="text-orange-300">(1 pt)</span>
                      </span>
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                    </button>
                  )}
                  {getOpts(myIdx).both && (
                    <button
                      onClick={() => updateGame({ mode: 'both' })}
                      className="group w-full bg-gradient-to-r from-orange-500 to-rose-600 hover:from-orange-400 hover:to-rose-500 text-white py-6 rounded-xl font-black text-xl shadow-lg shadow-orange-500/50 hover:shadow-orange-400/60 transform hover:scale-[1.02] transition overflow-hidden relative"
                    >
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Both <span className="text-white">(4 pts!)</span>
                      </span>
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
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
                <div className="relative z-10">
                  <div className="bg-gradient-to-r from-sky-500 to-blue-600 rounded-2xl p-8 mb-5 text-white shadow-lg shadow-sky-500/30 text-center">
                    <div className="inline-block p-4 bg-white/20 rounded-full mb-4">
                      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </div>
                    <div className="font-black mb-3 text-3xl drop-shadow-lg">
                      You're guessing {game.mode === 'both' ? 'BOTH' : game.mode === 'title' ? 'SONG TITLE' : 'ARTIST'}!
                    </div>
                    <div className="text-lg font-bold text-white/90">
                      {game.mode === 'both' ? '4 points' : game.mode === 'title' ? '2 points' : '1 point'}
                    </div>
                  </div>
                  <div className="bg-orange-500/20 border-2 border-orange-500 rounded-2xl p-5 text-center backdrop-blur-sm">
                    <p className="text-orange-300 font-black text-xl mb-2 drop-shadow-lg">Say your answer out loud!</p>
                    <p className="text-white/80 font-medium">DJ will judge if you're correct</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl p-8 sm:p-10 md:p-12 text-center shadow-2xl border border-white/10 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-transparent"></div>
              <div className="relative z-10">
                <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 border-4 border-sky-400 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xl sm:text-2xl font-bold text-white drop-shadow-lg">{game.players[game.buzzed].name} is guessing...</p>
              </div>
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
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-950 p-6 flex items-center justify-center relative overflow-hidden">
        {/* Premium gradient mesh background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-600/20 via-transparent to-transparent"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-rose-600/20 via-transparent to-transparent"></div>

        {/* Animated orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-br from-orange-400 to-rose-500 rounded-full opacity-25 blur-3xl animate-pulse" style={{animationDuration: '4s'}}></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gradient-to-br from-rose-400 to-orange-500 rounded-full opacity-25 blur-3xl animate-pulse" style={{animationDuration: '5s'}}></div>

        <div className="max-w-md w-full relative z-10">
          {/* Winner Card - Premium */}
          <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl p-10 text-center shadow-2xl border border-white/10 mb-6 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-rose-500/5 to-transparent"></div>
            <div className="relative z-10">
              <div className="inline-block p-8 bg-gradient-to-br from-orange-500/30 to-rose-600/30 rounded-full mb-4 ring-4 ring-orange-400/50">
                <svg className="w-24 h-24 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
              <h1 className="text-5xl font-black text-white mb-4 drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">WINNER!</h1>
              <div className="bg-gradient-to-r from-orange-500 to-rose-600 text-white text-4xl font-black py-4 px-6 rounded-2xl inline-block mb-3 shadow-2xl shadow-orange-500/50 ring-2 ring-white/20">
                {winner.name}
              </div>
              <div className="text-white/70 font-bold text-xl">
                {winner.score} points
              </div>
            </div>
          </div>

          {/* Leaderboard - Premium */}
          <div className="relative bg-white/5 backdrop-blur-2xl rounded-3xl p-6 shadow-2xl border border-white/10 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-blue-500/5 to-transparent"></div>
            <h3 className="relative z-10 text-2xl font-black text-white mb-5 text-center drop-shadow-lg">Final Scores</h3>
            <div className="relative z-10 space-y-3">
              {sortedPlayers.map((p, i) => (
                <div
                  key={p.id}
                  className={`rounded-xl p-4 flex justify-between items-center ${
                    i === 0
                      ? 'bg-gradient-to-r from-orange-500 to-rose-600 shadow-lg shadow-orange-500/50 text-white'
                      : i === 1
                      ? 'bg-gradient-to-r from-gray-400 to-gray-500 shadow-lg shadow-gray-400/30 text-white'
                      : i === 2
                      ? 'bg-gradient-to-r from-orange-400 to-amber-500 shadow-lg shadow-orange-400/30 text-white'
                      : 'bg-white/5 border border-white/10 backdrop-blur-sm'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-xl ${
                      i === 0 ? 'bg-gradient-to-br from-yellow-300 to-yellow-600 text-yellow-900 ring-2 ring-yellow-400/50' :
                      i === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-gray-900 ring-2 ring-gray-400/50' :
                      i === 2 ? 'bg-gradient-to-br from-orange-300 to-amber-600 text-orange-900 ring-2 ring-orange-400/50' :
                      'bg-white/10 text-white/70'
                    }`}>
                      {i + 1}
                    </div>
                    <span className={`font-bold text-xl ${i < 3 ? 'text-white' : 'text-white'}`}>
                      {p.name}
                    </span>
                  </div>
                  <span className={`font-black text-2xl ${i < 3 ? 'text-white' : 'text-white'}`}>
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