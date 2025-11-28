/**
 * API Client for Musical Wheelhouse Backend
 * Handles all communication with the Express/Spotify backend
 */

import { authService } from './authService';

// Use empty string to make requests relative (will use Vite proxy)
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

class ApiClient {
  /**
   * Get authorization headers
   */
  getHeaders() {
    const token = authService.getSessionToken();
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  }

  /**
   * Fetch all available playlists (requires authentication)
   */
  async fetchPlaylists() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/spotify/playlists`, {
        headers: this.getHeaders()
      });

      if (response.status === 401) {
        throw new Error('Authentication required. Please log in with Spotify.');
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch playlists: ${response.statusText}`);
      }

      const data = await response.json();
      return data.playlists;
    } catch (error) {
      console.error('API Client - fetchPlaylists error:', error);
      throw error;
    }
  }

  /**
   * Fetch tracks from a specific playlist (requires authentication)
   */
  async fetchPlaylistTracks(playlistId) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/spotify/playlists/${playlistId}/tracks`,
        {
          headers: this.getHeaders()
        }
      );

      if (response.status === 401) {
        throw new Error('Authentication required. Please log in with Spotify.');
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch playlist tracks: ${response.statusText}`);
      }

      const data = await response.json();
      return data.tracks;
    } catch (error) {
      console.error(`API Client - fetchPlaylistTracks error (${playlistId}):`, error);
      throw error;
    }
  }

  /**
   * Fetch specific track details (requires authentication)
   */
  async fetchTrack(trackId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/spotify/track/${trackId}`, {
        headers: this.getHeaders()
      });

      if (response.status === 401) {
        throw new Error('Authentication required. Please log in with Spotify.');
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch track: ${response.statusText}`);
      }

      const data = await response.json();
      return data.track;
    } catch (error) {
      console.error(`API Client - fetchTrack error (${trackId}):`, error);
      throw error;
    }
  }

  /**
   * Get Spotify access token for Web Playback SDK
   */
  async getAccessToken() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/token`, {
        headers: this.getHeaders()
      });

      if (response.status === 401) {
        throw new Error('Authentication required. Please log in with Spotify.');
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch access token: ${response.statusText}`);
      }

      const data = await response.json();
      return data.accessToken;
    } catch (error) {
      console.error('API Client - getAccessToken error:', error);
      throw error;
    }
  }

  /**
   * Check backend health
   */
  async healthCheck() {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);

      if (!response.ok) {
        throw new Error('Backend health check failed');
      }

      return await response.json();
    } catch (error) {
      console.error('API Client - health check error:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
