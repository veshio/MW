// Use empty string to make requests relative (will use Vite proxy)
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Authentication Service
 * Handles Spotify OAuth login, session management, and token refresh
 */
class AuthService {
  constructor() {
    this.sessionToken = null;
    this.user = null;
    this.loadSession();
  }

  /**
   * Load session from localStorage
   */
  loadSession() {
    try {
      const token = localStorage.getItem('spotify_session_token');
      const user = localStorage.getItem('spotify_user');

      if (token && user) {
        this.sessionToken = token;
        this.user = JSON.parse(user);
      }
    } catch (error) {
      console.error('Error loading session:', error);
      this.clearSession();
    }
  }

  /**
   * Save session to localStorage
   */
  saveSession(token, user) {
    this.sessionToken = token;
    this.user = user;

    localStorage.setItem('spotify_session_token', token);
    localStorage.setItem('spotify_user', JSON.stringify(user));
  }

  /**
   * Clear session
   */
  clearSession() {
    this.sessionToken = null;
    this.user = null;

    localStorage.removeItem('spotify_session_token');
    localStorage.removeItem('spotify_user');
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.sessionToken;
  }

  /**
   * Get current user
   */
  getUser() {
    return this.user;
  }

  /**
   * Get session token for API requests
   */
  getSessionToken() {
    return this.sessionToken;
  }

  /**
   * Initiate Spotify login
   */
  async login() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`);
      const data = await response.json();

      if (data.authUrl) {
        // Redirect to Spotify authorization page
        window.location.href = data.authUrl;
      } else {
        throw new Error('Failed to get authorization URL');
      }
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Handle OAuth callback
   * Called when user returns from Spotify with session token in URL
   */
  async handleCallback(sessionToken) {
    try {
      // Validate session and get user info
      const response = await fetch(`${API_BASE_URL}/api/auth/session`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Invalid session token');
      }

      const user = await response.json();

      // Save session
      this.saveSession(sessionToken, user);

      return user;
    } catch (error) {
      console.error('Callback error:', error);
      this.clearSession();
      throw error;
    }
  }

  /**
   * Logout
   */
  async logout() {
    try {
      if (this.sessionToken) {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ sessionToken: this.sessionToken })
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.clearSession();
    }
  }

  /**
   * Refresh token if needed
   */
  async refreshToken() {
    if (!this.sessionToken) {
      throw new Error('No session to refresh');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sessionToken: this.sessionToken })
      });

      if (!response.ok) {
        // Session expired, clear and require re-login
        this.clearSession();
        throw new Error('Session expired');
      }

      console.log('✓ Token refreshed');
    } catch (error) {
      console.error('Token refresh error:', error);
      this.clearSession();
      throw error;
    }
  }

  /**
   * Validate current session
   */
  async validateSession() {
    if (!this.sessionToken) {
      return false;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/session`, {
        headers: {
          'Authorization': `Bearer ${this.sessionToken}`
        }
      });

      if (!response.ok) {
        this.clearSession();
        return false;
      }

      const data = await response.json();

      // Refresh token if needed
      if (data.needsRefresh) {
        await this.refreshToken();
      }

      return true;
    } catch (error) {
      console.error('Session validation error:', error);
      this.clearSession();
      return false;
    }
  }
}

export const authService = new AuthService();
