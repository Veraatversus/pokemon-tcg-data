import { CONFIG } from '../config/config.js';

let tokenClient;
let gapiInited = false;
let gisInited = false;

/**
 * Initialize Google API Client
 */
export async function initializeGapi() {
  return new Promise((resolve) => {
    gapi.load('client', async () => {
      await gapi.client.init({
        apiKey: CONFIG.API_KEY,
        discoveryDocs: CONFIG.DISCOVERY_DOCS,
      });
      gapiInited = true;
      console.log('GAPI initialized');
      
      // Restore token from localStorage if exists
      const savedToken = localStorage.getItem('gapi_token');
      if (savedToken) {
        try {
          const token = JSON.parse(savedToken);
          // Check if token is still valid (not expired)
          if (token.expires_at && Date.now() < token.expires_at) {
            gapi.client.setToken(token);
            console.log('✅ Token restored from localStorage');
          } else {
            console.log('⚠️ Token expired, clearing...');
            localStorage.removeItem('gapi_token');
          }
        } catch (error) {
          console.error('Error restoring token:', error);
          localStorage.removeItem('gapi_token');
        }
      }
      
      resolve();
    });
  });
}

/**
 * Initialize Google Identity Services
 */
export function initializeGis(callback) {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: callback,
  });
  gisInited = true;
  console.log('GIS initialized');
}

/**
 * Handle Sign-In
 */
export function handleAuthClick() {
  if (!gapiInited || !gisInited) {
    console.error('APIs not initialized');
    alert('APIs sind noch nicht initialisiert. Bitte warte einen Moment.');
    return;
  }

  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) {
      console.error('Auth error:', resp);
      alert('Authentifizierung fehlgeschlagen: ' + resp.error);
      throw (resp);
    }
    console.log('Auth successful');
    
    // Save token to localStorage for persistence
    const token = gapi.client.getToken();
    if (token) {
      // Add expiration timestamp (typically 1 hour)
      token.expires_at = Date.now() + (3600 * 1000);
      localStorage.setItem('gapi_token', JSON.stringify(token));
      console.log('✅ Token saved to localStorage');
    }
    
    await onSignIn();
  };

  if (gapi.client.getToken() === null) {
    // Prompt user to select account and consent
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    // Skip display of account chooser and consent dialog
    tokenClient.requestAccessToken({prompt: ''});
  }
}

/**
 * Handle Sign-Out
 */
export function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
    localStorage.removeItem('gapi_token');
    console.log('Signed out');
    onSignOut();
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated() {
  return gapi.client.getToken() !== null;
}

/**
 * Get current user email from token
 */
export function getUserEmail() {
  const token = gapi.client.getToken();
  if (token && token.access_token) {
    try {
      // OAuth tokens are not JWTs, we can't decode them
      // Return a placeholder or try to get from Google API
      return 'User';
    } catch (error) {
      console.error('Error getting user info:', error);
      return 'User';
    }
  }
  return null;
}

// Callbacks (set by app.js)
let onSignIn = () => {};
let onSignOut = () => {};

export function setAuthCallbacks(signIn, signOut) {
  onSignIn = signIn;
  onSignOut = signOut;
}

/**
 * Initialize authentication and check for existing session
 */
export async function initAuth() {
  await initializeGapi();
  
  // Check if user is already authenticated (token exists)
  if (isAuthenticated()) {
    console.log('✅ User already authenticated, auto-login...');
    // Trigger onSignIn without showing auth popup
    await onSignIn();
    return true;
  }
  
  console.log('⚠️ No valid token found, user needs to login');
  return false;
}
