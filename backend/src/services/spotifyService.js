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
      // Search for playlists across 10 different genres for MORE variety
      // Each time we mix up the specific searches within each genre
      const genreQueries = {
        pop: ['pop music', 'pop hits', 'modern pop', 'pop party', 'top pop', 'pop 2024'],
        rock: ['rock classics', 'rock hits', 'alternative rock', 'indie rock', 'modern rock', 'rock anthems'],
        hiphop: ['hip hop', 'rap hits', 'r&b', 'urban', 'rap 2024', 'hip hop classics'],
        electronic: ['electronic', 'EDM', 'dance music', 'house music', 'techno', 'dubstep'],
        indie: ['indie music', 'indie folk', 'indie pop', 'indie alternative', 'indie rock', 'indie artists'],
        jazz: ['jazz classics', 'smooth jazz', 'jazz vibes', 'modern jazz', 'jazz piano', 'jazz cafe'],
        country: ['country hits', 'country music', 'modern country', 'country classics', 'country roads'],
        latin: ['latin hits', 'reggaeton', 'latin pop', 'spanish music', 'latin vibes', 'salsa'],
        metal: ['metal music', 'heavy metal', 'metal classics', 'rock metal', 'metalcore'],
        funk: ['funk music', 'funk classics', 'soul funk', 'disco funk', 'groovy funk']
      };

      // Randomly select TWO queries from each genre for more variety and volume
      // Keep track of genre for each query
      const selectedQueries = Object.entries(genreQueries).flatMap(([genre, queries]) => {
        // Shuffle the queries
        const shuffled = [...queries].sort(() => Math.random() - 0.5);
        // Take 2 random queries from each genre and tag with genre
        return shuffled.slice(0, 2).map(query => ({ query, genre }));
      });

      const allPlaylists = [];

      for (const { query, genre } of selectedQueries) {
        const data = await spotifyClient.requestWithUserToken(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=playlist&limit=10`,
          userToken
        );

        if (data.playlists && data.playlists.items) {
          // Tag each playlist with its genre
          const taggedPlaylists = data.playlists.items.map(pl => ({ ...pl, _genre: genre }));
          allPlaylists.push(...taggedPlaylists);
        }
      }

      // Low-effort playlist filter - exclude generic/lazy titles
      const lowEffortPatterns = [
        /^top\s+(songs?|hits?|playlist)/i,
        /^best\s+(songs?|hits?|playlist)/i,
        /^my\s+playlist/i,
        /^playlist\s+\d+/i,
        /^untitled/i,
        /^new\s+playlist/i,
        /^\d+$/  // Just numbers
      ];

      const isLowEffort = (name) => {
        return lowEffortPatterns.some(pattern => pattern.test(name));
      };

      // Remove duplicates, filter invalid/low-effort playlists, and transform to app format
      const seenIds = new Set();
      const playlists = allPlaylists
        .filter(pl => pl && pl.id && pl.name) // Filter out null/invalid playlists
        .filter(pl => !isLowEffort(pl.name)) // Filter out low-effort playlists
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
          owner: pl.owner?.display_name || 'Unknown',
          genre: pl._genre // Include genre tag
        }))
        // Sort by genre first, then shuffle within each genre
        .sort((a, b) => {
          if (a.genre === b.genre) {
            return Math.random() - 0.5; // Shuffle within genre
          }
          return a.genre.localeCompare(b.genre); // Sort by genre alphabetically
        })
        .slice(0, 100); // Limit to 100 playlists total (doubled!)

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
   * Returns all tracks for Web Playback SDK
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
      // Fetch tracks for Web Playback SDK (Premium playback)
      const data = await spotifyClient.requestWithUserToken(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
        userToken
      );

      // Transform to app format - include all valid tracks
      const tracks = data.items
        .filter(item => item.track && item.track.id) // Only valid tracks
        .map(item => ({
          id: item.track.id,
          name: item.track.name,
          artist: item.track.artists[0].name,
          album: item.track.album.name,
          albumArt: item.track.album.images?.[0]?.url || null,
          previewUrl: item.track.preview_url, // May be null, but we use SDK now
          uri: item.track.uri // For Web Playback SDK
        }));

      // Cache the result
      cache.tracks.set(cacheKey, {
        data: tracks,
        timestamp: Date.now()
      });

      console.log(`✓ Fetched ${tracks.length} tracks for Web Playback SDK`);
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
