/**
 * Spotify Web Playback SDK Service
 * Handles Spotify Premium playback in the browser
 */
class SpotifyPlayerService {
  constructor() {
    this.player = null;
    this.deviceId = null;
    this.accessToken = null;
    this.isReady = false;
    this.currentTrackUri = null;
    this.playbackTimer = null;
  }

  /**
   * Initialize the Spotify Web Playback SDK
   * Must be called with a valid access token (Premium required)
   */
  async initialize(accessToken) {
    if (this.player) {
      console.log('Player already initialized');
      return;
    }

    this.accessToken = accessToken;

    return new Promise((resolve, reject) => {
      // Wait for Spotify SDK to load
      window.onSpotifyWebPlaybackSDKReady = () => {
        console.log('Spotify Web Playback SDK loaded');

        const player = new window.Spotify.Player({
          name: 'Musical Wheelhouse',
          getOAuthToken: cb => { cb(accessToken); },
          volume: 0.5
        });

        // Error handling
        player.addListener('initialization_error', ({ message }) => {
          console.error('Initialization error:', message);
          reject(new Error(message));
        });

        player.addListener('authentication_error', ({ message }) => {
          console.error('Authentication error:', message);
          reject(new Error(message));
        });

        player.addListener('account_error', ({ message }) => {
          console.error('Account error (Premium required):', message);
          reject(new Error(message));
        });

        player.addListener('playback_error', ({ message }) => {
          console.error('Playback error:', message);
        });

        // Ready
        player.addListener('ready', ({ device_id }) => {
          console.log('✓ Spotify Player ready with Device ID:', device_id);
          this.deviceId = device_id;
          this.isReady = true;
          resolve(device_id);
        });

        // Not Ready
        player.addListener('not_ready', ({ device_id }) => {
          console.log('Device has gone offline:', device_id);
          this.isReady = false;
        });

        // Connect to the player
        player.connect().then(success => {
          if (success) {
            console.log('✓ Spotify Player connected successfully');
          }
        });

        this.player = player;
      };

      // Trigger SDK load if not already loaded
      if (window.Spotify) {
        window.onSpotifyWebPlaybackSDKReady();
      }
    });
  }

  /**
   * Play a track for a limited duration (default 30 seconds)
   * @param {string} trackUri - Spotify track URI (e.g., 'spotify:track:xxxxx')
   * @param {number} durationMs - How long to play in milliseconds (default 30000)
   */
  async playTrack(trackUri, durationMs = 30000) {
    if (!this.isReady || !this.deviceId) {
      throw new Error('Player not ready. Make sure you have Spotify Premium.');
    }

    // Clear any existing playback timer
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }

    this.currentTrackUri = trackUri;

    try {
      // Start playback using Spotify Web API
      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uris: [trackUri]
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Playback failed: ${error.error?.message || 'Unknown error'}`);
      }

      console.log(`✓ Playing track: ${trackUri} for ${durationMs}ms`);

      // Stop playback after duration
      this.playbackTimer = setTimeout(() => {
        this.pause();
      }, durationMs);

    } catch (error) {
      console.error('Error playing track:', error);
      throw error;
    }
  }

  /**
   * Pause playback
   */
  async pause() {
    if (!this.player) {
      return;
    }

    try {
      await this.player.pause();
      console.log('✓ Playback paused');

      // Clear timer
      if (this.playbackTimer) {
        clearTimeout(this.playbackTimer);
        this.playbackTimer = null;
      }
    } catch (error) {
      console.error('Error pausing:', error);
    }
  }

  /**
   * Resume playback
   */
  async resume() {
    if (!this.player) {
      return;
    }

    try {
      await this.player.resume();
      console.log('✓ Playback resumed');
    } catch (error) {
      console.error('Error resuming:', error);
    }
  }

  /**
   * Stop playback completely
   */
  async stop() {
    await this.pause();
    this.currentTrackUri = null;
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  async setVolume(volume) {
    if (!this.player) {
      return;
    }

    try {
      await this.player.setVolume(volume);
      console.log(`✓ Volume set to ${Math.round(volume * 100)}%`);
    } catch (error) {
      console.error('Error setting volume:', error);
    }
  }

  /**
   * Get current playback state
   */
  async getState() {
    if (!this.player) {
      return null;
    }

    try {
      return await this.player.getCurrentState();
    } catch (error) {
      console.error('Error getting state:', error);
      return null;
    }
  }

  /**
   * Disconnect and cleanup
   */
  disconnect() {
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }

    if (this.player) {
      this.player.disconnect();
      console.log('✓ Spotify Player disconnected');
    }

    this.player = null;
    this.deviceId = null;
    this.isReady = false;
    this.currentTrackUri = null;
  }
}

// Export singleton instance
export const spotifyPlayer = new SpotifyPlayerService();
