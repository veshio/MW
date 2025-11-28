import { spotifyClient } from '../config/spotify.js';
import { getAccessToken } from '../routes/auth.js';

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
   * Get popular public playlists from Spotify using Search API
   * Note: Spotify removed the /browse/featured-playlists endpoint on Nov 27, 2024
   * We now use the search endpoint to find popular public playlists
   */
  async getFeaturedPlaylists(sessionToken) {
    const userToken = getAccessToken(sessionToken);

    if (!userToken) {
      throw new Error('Valid session required to fetch playlists');
    }

    const cacheKey = 'public_playlists';

    if (cache.playlists && cache.playlists[cacheKey] && Date.now() - cache.playlists[cacheKey].timestamp < cache.cacheTTL) {
      console.log('✓ Returning cached public playlists');
      return cache.playlists[cacheKey].data;
    }

    console.log('Searching for popular public playlists using Search API...');

    try {
      // Search for popular playlists using different queries
      // We'll search for several popular genres/topics to get a variety
      const queries = ['pop hits', 'top songs', 'rock classics', 'hip hop', 'chill vibes'];
      const allPlaylists = [];

      for (const query of queries) {
        const data = await spotifyClient.requestWithUserToken(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=playlist&limit=10`,
          userToken
        );

        if (data.playlists && data.playlists.items) {
          allPlaylists.push(...data.playlists.items);
        }
      }

      // Remove duplicates, filter invalid playlists, and transform to app format
      const seenIds = new Set();
      const playlists = allPlaylists
        .filter(pl => pl && pl.id && pl.name) // Filter out null/invalid playlists
        .filter(pl => {
          if (seenIds.has(pl.id)) return false;
          seenIds.add(pl.id);
          return true;
        })
        .map(pl => ({
          id: pl.id,
          name: pl.name,
          description: pl.description || '',
          image: pl.images?.[0]?.url || null,
          trackCount: pl.tracks?.total || 0,
          owner: pl.owner?.display_name || 'Unknown'
        }))
        .slice(0, 50); // Limit to 50 playlists total

      // Cache the result
      if (!cache.playlists) cache.playlists = {};
      cache.playlists[cacheKey] = {
        data: playlists,
        timestamp: Date.now()
      };

      console.log(`✓ Found ${playlists.length} public playlists`);
      return playlists;
    } catch (error) {
      console.error('Error searching for public playlists:', error);
      throw error;
    }
  },

  /**
   * Get tracks from a specific playlist
   * Only returns tracks with preview URLs
   */
  async getPlaylistTracks(playlistId, sessionToken) {
    const userToken = getAccessToken(sessionToken);

    if (!userToken) {
      throw new Error('Valid session required to fetch tracks');
    }

    const cacheKey = playlistId;
    const cached = cache.tracks.get(cacheKey);

    // Return cached tracks if available and fresh
    if (cached && Date.now() - cached.timestamp < cache.cacheTTL) {
      console.log(`✓ Returning cached tracks for playlist ${playlistId}`);
      return cached.data;
    }

    console.log(`Fetching tracks for playlist ${playlistId}...`);

    try {
      // Fetch more tracks to increase chance of finding ones with previews
      const data = await spotifyClient.requestWithUserToken(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
        userToken
      );

      // Transform to app format and filter tracks with preview URLs
      const totalTracks = data.items.filter(item => item.track).length;
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

      console.log(`✓ Fetched ${tracks.length}/${totalTracks} tracks with previews (${Math.round(tracks.length/totalTracks*100)}%)`);
      return tracks;
    } catch (error) {
      console.error(`Error fetching tracks for playlist ${playlistId}:`, error);
      throw error;
    }
  },

  /**
   * Get specific track details
   */
  async getTrack(trackId, sessionToken) {
    const userToken = getAccessToken(sessionToken);

    if (!userToken) {
      throw new Error('Valid session required to fetch track');
    }

    try {
      const track = await spotifyClient.requestWithUserToken(
        `https://api.spotify.com/v1/tracks/${trackId}`,
        userToken
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
