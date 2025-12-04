import express from 'express';
import crypto from 'crypto';
import fetch from 'node-fetch';

const router = express.Router();

// In-memory session storage (upgrade to Redis for production with multiple servers)
const sessions = new Map();
const SESSION_TTL = 60 * 60 * 1000; // 1 hour

// Getter functions to read env vars at runtime (after dotenv is loaded)
const getSpotifyConfig = (req) => {
  // Check Referer header to detect network requests
  // Browser sends Referer like "http://192.168.2.14:5173/" or "http://127.0.0.1:5173/"
  const referer = req?.get('referer') || req?.get('origin') || '';
  const isNetworkRequest = referer.includes('192.168.2.14');

  console.log('🔍 Request detection:', {
    referer,
    origin: req?.get('origin'),
    host: req?.get('host'),
    isNetworkRequest
  });

  return {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: isNetworkRequest
      ? 'http://192.168.2.14:3001/api/auth/callback'
      : (process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:3001/api/auth/callback'),
    frontendUrl: isNetworkRequest
      ? 'http://192.168.2.14:5173'
      : (process.env.FRONTEND_URL || 'http://127.0.0.1:5173')
  };
};

// Required scopes for the app
const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-private',
  'user-read-email',
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state'
].join(' ');

/**
 * Generate cryptographically secure random string for PKCE
 */
function generateRandomString(length) {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

/**
 * Generate PKCE code challenge from verifier
 */
function generateCodeChallenge(verifier) {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
}

/**
 * Clean up expired sessions
 */
function cleanupSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL) {
      sessions.delete(sessionId);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupSessions, 10 * 60 * 1000);

/**
 * GET /api/auth/login
 * Initiates OAuth flow with PKCE
 */
router.get('/login', (req, res) => {
  try {
    const config = getSpotifyConfig(req);

    // Generate PKCE parameters
    const state = generateRandomString(16);
    const codeVerifier = generateRandomString(128);
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // Store PKCE verifier in session
    sessions.set(state, {
      codeVerifier,
      createdAt: Date.now()
    });

    // Build Spotify authorization URL
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      state: state,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge
    });

    const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

    res.json({ authUrl });
  } catch (error) {
    console.error('Error initiating login:', error);
    res.status(500).json({ error: 'Failed to initiate login' });
  }
});

/**
 * GET /api/auth/callback
 * Handles OAuth callback from Spotify
 */
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const config = getSpotifyConfig(req);

  // Handle OAuth error
  if (error) {
    console.error('OAuth error:', error);
    return res.redirect(`${config.frontendUrl}?error=access_denied`);
  }

  // Validate state parameter (CSRF protection)
  if (!state || !sessions.has(state)) {
    console.error('Invalid or missing state parameter');
    return res.redirect(`${config.frontendUrl}?error=invalid_state`);
  }

  try {
    // Retrieve PKCE verifier
    const session = sessions.get(state);
    const codeVerifier = session.codeVerifier;

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: config.redirectUri,
        code_verifier: codeVerifier
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('❌ Token exchange failed:');
      console.error('   Status:', tokenResponse.status, tokenResponse.statusText);
      console.error('   Error:', tokenData.error);
      console.error('   Description:', tokenData.error_description);
      console.error('   Redirect URI used:', config.redirectUri);
      console.error('   Client ID:', config.clientId ? `${config.clientId.substring(0, 8)}...` : 'NOT SET');
      return res.redirect(`${config.frontendUrl}?error=token_failed`);
    }

    // Get user profile
    const profileResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });

    const profile = await profileResponse.json();

    // Create session token
    const sessionToken = generateRandomString(32);

    // Store user session
    sessions.set(sessionToken, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      userId: profile.id,
      displayName: profile.display_name,
      email: profile.email,
      createdAt: Date.now()
    });

    // Clean up OAuth state
    sessions.delete(state);

    console.log(`✓ User authenticated: ${profile.display_name} (${profile.id})`);

    // Redirect to frontend with session token
    res.redirect(`${config.frontendUrl}?session=${sessionToken}`);
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    res.redirect(`${config.frontendUrl}?error=auth_failed`);
  }
});

/**
 * POST /api/auth/refresh
 * Refreshes an expired access token
 */
router.post('/refresh', async (req, res) => {
  const { sessionToken } = req.body;
  const config = getSpotifyConfig(req);

  if (!sessionToken || !sessions.has(sessionToken)) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  try {
    const session = sessions.get(sessionToken);

    // Exchange refresh token for new access token
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Token refresh failed:', tokenData);
      return res.status(401).json({ error: 'Failed to refresh token' });
    }

    // Update session with new token
    session.accessToken = tokenData.access_token;
    session.expiresAt = Date.now() + (tokenData.expires_in * 1000);

    // Refresh token may be rotated
    if (tokenData.refresh_token) {
      session.refreshToken = tokenData.refresh_token;
    }

    console.log(`✓ Token refreshed for user: ${session.displayName}`);

    res.json({ success: true });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

/**
 * GET /api/auth/session
 * Validates and returns session info
 */
router.get('/session', (req, res) => {
  const sessionToken = req.headers.authorization?.replace('Bearer ', '');

  if (!sessionToken || !sessions.has(sessionToken)) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const session = sessions.get(sessionToken);

  // Check if token needs refresh
  const needsRefresh = session.expiresAt - Date.now() < 5 * 60 * 1000; // 5 min buffer

  res.json({
    userId: session.userId,
    displayName: session.displayName,
    email: session.email,
    needsRefresh
  });
});

/**
 * POST /api/auth/logout
 * Destroys user session
 */
router.post('/logout', (req, res) => {
  const { sessionToken } = req.body;

  if (sessionToken && sessions.has(sessionToken)) {
    const session = sessions.get(sessionToken);
    console.log(`✓ User logged out: ${session.displayName}`);
    sessions.delete(sessionToken);
  }

  res.json({ success: true });
});

/**
 * GET /api/auth/token
 * Returns the access token for Web Playback SDK initialization
 */
router.get('/token', (req, res) => {
  const sessionToken = req.headers.authorization?.replace('Bearer ', '');

  if (!sessionToken || !sessions.has(sessionToken)) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const session = sessions.get(sessionToken);

  // Check if token is expired
  if (session.expiresAt <= Date.now()) {
    return res.status(401).json({ error: 'Token expired' });
  }

  res.json({ accessToken: session.accessToken });
});

/**
 * Get access token for a session (internal use)
 */
export function getAccessToken(sessionToken) {
  if (!sessionToken || !sessions.has(sessionToken)) {
    return null;
  }

  const session = sessions.get(sessionToken);

  // Check if token is expired
  if (session.expiresAt <= Date.now()) {
    return null;
  }

  return session.accessToken;
}

/**
 * Get session data (internal use)
 */
export function getSession(sessionToken) {
  if (!sessionToken || !sessions.has(sessionToken)) {
    return null;
  }

  return sessions.get(sessionToken);
}

export default router;
