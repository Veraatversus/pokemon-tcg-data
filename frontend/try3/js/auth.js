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
      // Decode JWT token to get user info
      const base64Url = token.access_token.split('.')[1];
      if (!base64Url) return 'User';
      
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      
      const payload = JSON.parse(jsonPayload);
      return payload.email || 'User';
    } catch (error) {
      console.error('Error decoding token:', error);
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
