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
      // Don't load discovery docs with API key - they'll be loaded after authentication
      await gapi.client.init({
        // Removed apiKey and discoveryDocs - will be loaded after OAuth
      });
      gapiInited = true;
      console.log('✅ GAPI initialized (no API key needed)');
      
      // Restore token from localStorage if exists
      const savedToken = localStorage.getItem('gapi_token');
      if (savedToken) {
        try {
          const token = JSON.parse(savedToken);
          // Check if token is still valid (not expired)
          if (token.expires_at && Date.now() < token.expires_at) {
            gapi.client.setToken(token);
            console.log('✅ Token restored from localStorage');
            // Load discovery docs now that we have a token
            await loadDiscoveryDocs();
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
 * Load discovery docs for Google Sheets API
 */
export async function loadDiscoveryDocs() {
  try {
    await gapi.client.load('sheets', 'v4');
    console.log('✅ Sheets API loaded');
  } catch (error) {
    console.error('Error loading Sheets API:', error);
  }
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
  console.log('🔐 handleAuthClick called');
  console.log('GAPI initialized:', gapiInited);
  console.log('GIS initialized:', gisInited);
  
  if (!gapiInited || !gisInited) {
    console.error('APIs not initialized');
    alert('APIs sind noch nicht initialisiert. Bitte warte einen Moment und versuche es erneut.');
    return;
  }
  
  console.log('✅ APIs ready, requesting token...');

  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) {
      console.error('Auth error:', resp);
      alert('Authentifizierung fehlgeschlagen: ' + (resp.error_description || resp.error));
      return; // Don't throw, just return
    }
    
    console.log('✅ Auth successful');
    
    // Save token to localStorage for persistence
    const token = gapi.client.getToken();
    if (token) {
      // Add expiration timestamp (typically 1 hour)
      token.expires_at = Date.now() + (3600 * 1000);
      localStorage.setItem('gapi_token', JSON.stringify(token));
      console.log('✅ Token saved to localStorage');
    }
    
    // Load Sheets API now that we're authenticated
    try {
      await loadDiscoveryDocs();
    } catch (error) {
      console.error('Error loading discovery docs:', error);
    }
    
    // Call sign-in callback
    try {
      await onSignIn();
    } catch (error) {
      console.error('Error in onSignIn callback:', error);
      alert('Fehler nach der Anmeldung: ' + error.message);
    }
  };

  // Check if already authenticated
  const existingToken = gapi.client.getToken();
  if (existingToken === null) {
    // Prompt user to select account and consent
    console.log('🔐 Requesting new access token...');
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    // Skip display of account chooser and consent dialog
    console.log('🔐 Refreshing access token...');
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
    // Load Sheets API for authenticated user
    try {
      await loadDiscoveryDocs();
    } catch (error) {
      console.error('Error loading discovery docs:', error);
    }
    // Trigger onSignIn without showing auth popup
    await onSignIn();
    return true;
  }
  
  console.log('⚠️ No valid token found, user needs to login');
  return false;
}
