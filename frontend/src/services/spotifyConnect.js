/**
 * Spotify Connect API Service
 * Controls playback on user's Spotify devices (phones, speakers, computers)
 * For mobile browsers where Web Playback SDK doesn't work
 */

/**
 * Get available Spotify devices for the authenticated user
 * @param {string} sessionToken - User's session token
 * @returns {Promise<Object>} - Devices response from Spotify API
 */
export async function getDevices(sessionToken) {
  const response = await fetch('/api/spotify/devices', {
    headers: {
      'Authorization': `Bearer ${sessionToken}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch devices');
  }

  return response.json();
}

/**
 * Start playback on a specific device
 * @param {string} sessionToken - User's session token
 * @param {string} trackUri - Spotify track URI (e.g., "spotify:track:...")
 * @param {string} deviceId - Spotify device ID
 * @returns {Promise<Object>} - Success response
 */
export async function play(sessionToken, trackUri, deviceId) {
  const response = await fetch('/api/spotify/play', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({ trackUri, deviceId })
  });

  if (!response.ok) {
    throw new Error('Failed to start playback');
  }

  return response.json();
}

/**
 * Pause playback on a specific device
 * @param {string} sessionToken - User's session token
 * @param {string} deviceId - Spotify device ID
 * @returns {Promise<Object>} - Success response
 */
export async function pause(sessionToken, deviceId) {
  const response = await fetch('/api/spotify/pause', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({ deviceId })
  });

  if (!response.ok) {
    throw new Error('Failed to pause playback');
  }

  return response.json();
}

/**
 * Spotify Connect Service
 * Exported as an object for consistency with other services
 */
export const spotifyConnect = {
  getDevices,
  play,
  pause
};
