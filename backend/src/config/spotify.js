import fetch from 'node-fetch';

/**
 * Spotify Client Credentials OAuth flow
 * Handles app-level authentication with automatic token refresh
 */
class SpotifyClient {
  constructor() {
    this.clientId = process.env.SPOTIFY_CLIENT_ID;
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Get access token (cached or fresh)
   * Automatically refreshes if expired
   */
  async getAccessToken() {
    // Check if token exists and is still valid (with 5-min buffer)
    if (this.accessToken && this.tokenExpiry > Date.now() + 5 * 60 * 1000) {
      return this.accessToken;
    }

    // Get new token via Client Credentials flow
    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`
    ).toString('base64');

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });

      if (!response.ok) {
        throw new Error(`Spotify auth failed: ${response.statusText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000);

      console.log('✓ Spotify access token obtained');
      return this.accessToken;
    } catch (error) {
      console.error('Failed to get Spotify access token:', error);
      throw error;
    }
  }

  /**
   * Make authenticated request to Spotify API
   */
  async request(url, options = {}) {
    const token = await this.getAccessToken();
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}

export const spotifyClient = new SpotifyClient();
