/**
 * Audio Player Service
 * Wraps HTML5 Audio for Spotify preview URL playback
 */

class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    this.currentTrack = null;
    this.isPlaying = false;

    // Set up event listeners
    this.audio.addEventListener('ended', () => {
      this.isPlaying = false;
      console.log('Playback ended');
    });

    this.audio.addEventListener('error', (e) => {
      console.error('Audio playback error:', e);
      this.isPlaying = false;
    });
  }

  /**
   * Play a track from preview URL
   */
  async play(previewUrl) {
    if (!previewUrl) {
      throw new Error('No preview URL provided');
    }

    try {
      // Stop current playback if any
      this.stop();

      // Set new source and play
      this.audio.src = previewUrl;
      this.audio.volume = 0.7;
      this.currentTrack = previewUrl;

      await this.audio.play();
      this.isPlaying = true;

      console.log('Playing preview:', previewUrl);
    } catch (error) {
      console.error('Failed to play audio:', error);
      this.isPlaying = false;
      throw error;
    }
  }

  /**
   * Pause playback
   */
  pause() {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
      this.isPlaying = false;
      console.log('Playback paused');
    }
  }

  /**
   * Resume playback
   */
  resume() {
    if (this.audio && this.audio.paused && this.currentTrack) {
      this.audio.play();
      this.isPlaying = true;
      console.log('Playback resumed');
    }
  }

  /**
   * Stop playback completely
   */
  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.isPlaying = false;
      console.log('Playback stopped');
    }
  }

  /**
   * Get current playback time
   */
  getCurrentTime() {
    return this.audio.currentTime || 0;
  }

  /**
   * Get track duration
   */
  getDuration() {
    return this.audio.duration || 30; // Spotify previews are 30 seconds
  }

  /**
   * Set playback volume (0.0 to 1.0)
   */
  setVolume(volume) {
    this.audio.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Seek to specific time
   */
  seek(time) {
    if (this.audio) {
      this.audio.currentTime = time;
    }
  }

  /**
   * Add event listener for when playback ends
   */
  onEnded(callback) {
    this.audio.addEventListener('ended', callback);
  }

  /**
   * Add event listener for time updates
   */
  onTimeUpdate(callback) {
    this.audio.addEventListener('timeupdate', callback);
  }
}

// Export singleton instance
export const audioPlayer = new AudioPlayer();
