import express from 'express';
import { spotifyService } from '../services/spotifyService.js';
import { getSession } from './auth.js';

const router = express.Router();

/**
 * Middleware to require authentication
 */
function requireAuth(req, res, next) {
  const sessionToken = req.headers.authorization?.replace('Bearer ', '');

  if (!sessionToken) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const session = getSession(sessionToken);

  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  // Attach session to request
  req.session = session;
  req.sessionToken = sessionToken;

  next();
}

/**
 * GET /api/spotify/playlists
 * Get Spotify's featured/curated playlists (better preview coverage)
 */
router.get('/playlists', requireAuth, async (req, res, next) => {
  try {
    const playlists = await spotifyService.getFeaturedPlaylists(req.sessionToken);
    res.json({ playlists });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/spotify/playlists/:id/tracks
 * Get tracks from a specific playlist (only tracks with preview URLs)
 */
router.get('/playlists/:id/tracks', requireAuth, async (req, res, next) => {
  try {
    const tracks = await spotifyService.getPlaylistTracks(req.params.id, req.sessionToken);
    res.json({ tracks });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/spotify/track/:id
 * Get specific track details
 */
router.get('/track/:id', requireAuth, async (req, res, next) => {
  try {
    const track = await spotifyService.getTrack(req.params.id, req.sessionToken);
    res.json({ track });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/spotify/cache/clear
 * Clear the cache (useful for development/testing)
 */
router.post('/cache/clear', (req, res) => {
  spotifyService.clearCache();
  res.json({ message: 'Cache cleared successfully' });
});

export default router;
