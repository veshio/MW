/**
 * API Client for Musical Wheelhouse Backend
 * Handles all communication with the Express/Spotify backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

class ApiClient {
  /**
   * Fetch all available playlists
   */
  async fetchPlaylists() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/spotify/playlists`);

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
   * Fetch tracks from a specific playlist
   */
  async fetchPlaylistTracks(playlistId) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/spotify/playlists/${playlistId}/tracks`
      );

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
   * Fetch specific track details
   */
  async fetchTrack(trackId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/spotify/track/${trackId}`);

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
