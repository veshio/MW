import express from 'express';
import fetch from 'node-fetch';
import { spotifyService } from '../services/spotifyService.js';
import { getSession, getAccessToken } from './auth.js';

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
 * GET /api/spotify/devices
 * Get available Spotify Connect devices for the authenticated user
 */
router.get('/devices', requireAuth, async (req, res, next) => {
  try {
    const userToken = getAccessToken(req.sessionToken);

    if (!userToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error fetching devices:', response.status, errorText);
      return res.status(response.status).json({ error: 'Failed to fetch devices' });
    }

    const devices = await response.json();
    res.json(devices);
  } catch (error) {
    console.error('Error fetching devices:', error);
    next(error);
  }
});

/**
 * POST /api/spotify/play
 * Start playback on a specific device using Spotify Connect API
 */
router.post('/play', requireAuth, async (req, res, next) => {
  try {
    const userToken = getAccessToken(req.sessionToken);
    const { trackUri, deviceId } = req.body;

    if (!userToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!trackUri || !deviceId) {
      return res.status(400).json({ error: 'trackUri and deviceId are required' });
    }

    const url = `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uris: [trackUri] })
    });

    // Spotify returns 204 No Content on success
    if (!response.ok && response.status !== 204) {
      const errorText = await response.text();
      console.error('Error playing track:', response.status, errorText);
      return res.status(response.status).json({ error: 'Failed to start playback' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error playing track:', error);
    next(error);
  }
});

/**
 * POST /api/spotify/pause
 * Pause playback on a specific device using Spotify Connect API
 */
router.post('/pause', requireAuth, async (req, res, next) => {
  try {
    const userToken = getAccessToken(req.sessionToken);
    const { deviceId } = req.body;

    if (!userToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    const url = `https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });

    // Spotify returns 204 No Content on success
    if (!response.ok && response.status !== 204) {
      const errorText = await response.text();
      console.error('Error pausing playback:', response.status, errorText);
      return res.status(response.status).json({ error: 'Failed to pause playback' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error pausing playback:', error);
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
