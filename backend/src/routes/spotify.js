import express from 'express';
import { spotifyService } from '../services/spotifyService.js';

const router = express.Router();

/**
 * GET /api/spotify/playlists
 * Get available playlists from the app's Spotify account
 */
router.get('/playlists', async (req, res, next) => {
  try {
    const playlists = await spotifyService.getPlaylists();
    res.json({ playlists });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/spotify/playlists/:id/tracks
 * Get tracks from a specific playlist (only tracks with preview URLs)
 */
router.get('/playlists/:id/tracks', async (req, res, next) => {
  try {
    const tracks = await spotifyService.getPlaylistTracks(req.params.id);
    res.json({ tracks });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/spotify/track/:id
 * Get specific track details
 */
router.get('/track/:id', async (req, res, next) => {
  try {
    const track = await spotifyService.getTrack(req.params.id);
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
