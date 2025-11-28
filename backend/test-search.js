// Quick test of Spotify Search API
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

console.log('Testing Spotify Search API...');
console.log('Client ID:', clientId ? 'SET' : 'NOT SET');

// Get access token using Client Credentials
async function getAccessToken() {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });

  const data = await response.json();
  return data.access_token;
}

// Test fetching tracks from a playlist
async function testPlaylistTracks(token, playlistId) {
  console.log(`\n--- Testing tracks for playlist ${playlistId} ---`);

  const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('✗ Failed to fetch tracks:', response.status, error);
    return;
  }

  const data = await response.json();

  const totalTracks = data.items.filter(item => item.track).length;
  const tracksWithPreviews = data.items.filter(item => item.track && item.track.preview_url);

  console.log(`Total tracks: ${totalTracks}`);
  console.log(`Tracks with preview URLs: ${tracksWithPreviews.length} (${Math.round(tracksWithPreviews.length/totalTracks*100)}%)`);

  if (tracksWithPreviews.length > 0) {
    console.log('\nFirst 3 tracks with previews:');
    tracksWithPreviews.slice(0, 3).forEach((item, i) => {
      console.log(`  ${i+1}. ${item.track.name} by ${item.track.artists[0].name}`);
      console.log(`     Preview: ${item.track.preview_url}`);
    });
  }
}

// Test search endpoint and get tracks
async function testSearch() {
  try {
    const token = await getAccessToken();
    console.log('✓ Got access token');

    // Try different queries to find playlists with preview URLs
    const queries = ['80s hits', '90s rock', '2000s pop', 'classic rock', 'oldies'];

    for (const query of queries) {
      console.log(`\n=== Searching for: "${query}" ===`);
      const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=playlist&limit=3`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) continue;

      const data = await response.json();
      if (!data.playlists || !data.playlists.items) continue;

      const validPlaylists = data.playlists.items.filter(pl => pl && pl.name);
      if (validPlaylists.length === 0) continue;

      const firstPlaylist = validPlaylists[0];
      console.log(`Testing: ${firstPlaylist.name}`);
      await testPlaylistTracks(token, firstPlaylist.id);
    }

    return;

    const query = 'top hits';
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=playlist&limit=5`;

    console.log(`\nSearching for: "${query}"`);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('✗ Search failed:', response.status, error);
      return;
    }

    const data = await response.json();

    if (data.playlists && data.playlists.items) {
      console.log(`✓ Found ${data.playlists.items.length} playlists:`);

      const validPlaylists = data.playlists.items.filter(pl => pl && pl.name);

      validPlaylists.forEach((pl, i) => {
        console.log(`  ${i+1}. ${pl.name} (by ${pl.owner?.display_name || 'Unknown'}) - ${pl.tracks?.total || 0} tracks`);
      });

      // Test tracks for the first valid playlist
      if (validPlaylists.length > 0) {
        const firstPlaylist = validPlaylists[0];
        await testPlaylistTracks(token, firstPlaylist.id);
      }
    } else {
      console.log('✗ No playlists in response');
    }
  } catch (error) {
    console.error('✗ Error:', error.message);
  }
}

testSearch();
