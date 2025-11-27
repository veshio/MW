import { spotifyClient } from '../config/spotify.js';

/**
 * In-memory cache for Spotify data
 * For production with multiple servers, consider Redis
 */
const cache = {
  playlists: null,
  tracks: new Map(), // playlistId -> tracks[]
  cacheTTL: 24 * 60 * 60 * 1000 // 24 hours
};

/**
 * Spotify Service
 * High-level wrapper for Spotify API with caching
 */
export const spotifyService = {
  /**
   * Get curated playlists from the app's Spotify account
   */
  async getPlaylists() {
    // Return cached playlists if available and fresh
    if (cache.playlists && Date.now() - cache.playlists.timestamp < cache.cacheTTL) {
      console.log('✓ Returning cached playlists');
      return cache.playlists.data;
    }

    console.log('Fetching playlists from Spotify...');
    const userId = process.env.SPOTIFY_USER_ID;

    if (!userId) {
      throw new Error('SPOTIFY_USER_ID not configured');
    }

    try {
      const data = await spotifyClient.request(
        `https://api.spotify.com/v1/users/${userId}/playlists?limit=50`
      );

      // Transform to app format
      const playlists = data.items.map(pl => ({
        id: pl.id,
        name: pl.name,
        description: pl.description || '',
        image: pl.images?.[0]?.url || null,
        trackCount: pl.tracks.total
      }));

      // Cache the result
      cache.playlists = {
        data: playlists,
        timestamp: Date.now()
      };

      console.log(`✓ Fetched ${playlists.length} playlists`);
      return playlists;
    } catch (error) {
      console.error('Error fetching playlists:', error);
      throw error;
    }
  },

  /**
   * Get tracks from a specific playlist
   * Only returns tracks with preview URLs
   */
  async getPlaylistTracks(playlistId) {
    const cacheKey = playlistId;
    const cached = cache.tracks.get(cacheKey);

    // Return cached tracks if available and fresh
    if (cached && Date.now() - cached.timestamp < cache.cacheTTL) {
      console.log(`✓ Returning cached tracks for playlist ${playlistId}`);
      return cached.data;
    }

    console.log(`Fetching tracks for playlist ${playlistId}...`);

    try {
      const data = await spotifyClient.request(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`
      );

      // Transform to app format and filter tracks with preview URLs
      const tracks = data.items
        .filter(item => item.track && item.track.preview_url) // Only tracks with previews
        .map(item => ({
          id: item.track.id,
          name: item.track.name,
          artist: item.track.artists[0].name,
          album: item.track.album.name,
          albumArt: item.track.album.images?.[0]?.url || null,
          previewUrl: item.track.preview_url, // 30-second preview
          uri: item.track.uri // For future full playback
        }));

      // Cache the result
      cache.tracks.set(cacheKey, {
        data: tracks,
        timestamp: Date.now()
      });

      console.log(`✓ Fetched ${tracks.length} tracks with previews`);
      return tracks;
    } catch (error) {
      console.error(`Error fetching tracks for playlist ${playlistId}:`, error);
      throw error;
    }
  },

  /**
   * Get specific track details
   */
  async getTrack(trackId) {
    try {
      const track = await spotifyClient.request(
        `https://api.spotify.com/v1/tracks/${trackId}`
      );

      return {
        id: track.id,
        name: track.name,
        artist: track.artists[0].name,
        album: track.album.name,
        albumArt: track.album.images?.[0]?.url || null,
        previewUrl: track.preview_url,
        uri: track.uri
      };
    } catch (error) {
      console.error(`Error fetching track ${trackId}:`, error);
      throw error;
    }
  },

  /**
   * Clear cache (useful for testing)
   */
  clearCache() {
    cache.playlists = null;
    cache.tracks.clear();
    console.log('✓ Cache cleared');
  }
};
