/**
 * Global Error Handler & Recovery System
 */
import { CONFIG } from '../config/config.js';
import { showError } from './ui.js';

/**
 * Custom App Error
 */
export class AppError extends Error {
  constructor(message, code = 'ERROR', details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();
  }
}

/**
 * Error Recovery Strategy
 */
export const ErrorRecovery = {
  // Auth errors
  AUTH_FAILED: {
    code: 'AUTH_FAILED',
    message: 'Authentifizierung fehlgeschlagen',
    recovery: () => {
      // Redirect to login
      const selector = document.getElementById('set-selector');
      if (selector) selector.selectedIndex = 0;
      document.getElementById('main-container').style.display = 'none';
      document.getElementById('auth-container').style.display = 'flex';
    }
  },

  // Network errors
  NETWORK_ERROR: {
    code: 'NETWORK_ERROR',
    message: 'Netzwerkfehler. Überprüfen Sie Ihre Internetverbindung.',
    recovery: () => {
      // Retry logic is handled in the API call
      console.log('Netzwerkfehler. Versuchen Sie es später erneut.');
    }
  },

  // API errors
  API_ERROR: {
    code: 'API_ERROR',
    message: 'Google Sheets API Error',
    recovery: () => {
      // Show user that sheet data couldn't be loaded
    }
  },

  // Sheet configuration errors
  CONFIG_ERROR: {
    code: 'CONFIG_ERROR',
    message: 'Konfigurationsfehler - Spreadsheet-ID oder Client-ID fehlt',
    recovery: () => {
      console.error('Bitte konfigurieren Sie config/config.js korrekt');
    }
  },

  // Cache errors
  CACHE_ERROR: {
    code: 'CACHE_ERROR',
    message: 'Cache-Fehler',
    recovery: () => {
      // Clear cache and reload
      localStorage.clear();
      location.reload();
    }
  }
};

/**
 * Global error handler
 */
export function handleError(error, context = '') {
  console.error(`[${context}] Error:`, error);

  // Try to show user-friendly message
  let userMessage = 'Ein Fehler ist aufgetreten';
  let recovery = null;

  if (error instanceof AppError) {
    userMessage = error.message;
    const strategy = ErrorRecovery[error.code];
    if (strategy) {
      recovery = strategy.recovery;
    }
  } else if (error.message) {
    userMessage = error.message;

    // Detect error type
    if (error.message.includes('auth') || error.message.includes('token')) {
      recovery = ErrorRecovery.AUTH_FAILED.recovery;
    } else if (error.message.includes('network') || error.message.includes('offline')) {
      userMessage = ErrorRecovery.NETWORK_ERROR.message;
      recovery = ErrorRecovery.NETWORK_ERROR.recovery;
    } else if (error.message.includes('Spreadsheet') || error.message.includes('API')) {
      userMessage = ErrorRecovery.API_ERROR.message;
    }
  }

  // Show error to user
  showErrorUI(userMessage, recovery);

  // Log error for debugging
  logError({
    message: error.message,
    context,
    code: error.code,
    stack: error.stack,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString()
  });

  return userMessage;
}

/**
 * Show error in UI
 */
function showErrorUI(message, recovery) {
  // Show as toast (import already at top of file)
  showError(message);

  // If there's a recovery action, call it
  if (recovery && typeof recovery === 'function') {
    setTimeout(recovery, 2000);
  }
}

/**
 * Log error for debugging (could send to server)
 */
function logError(errorData) {
  if (window.__DEBUG__) {
    console.log('Error logged:', errorData);
    // Could send to a logging service here
  }
}

/**
 * Setup global error handlers
 */
export function setupGlobalErrorHandlers() {
  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    handleError(
      new AppError(
        'Ein unerwarteter Fehler ist aufgetreten',
        'UNHANDLED_REJECTION',
        { reason: event.reason }
      ),
      'unhandledrejection'
    );
  });

  // Global errors
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    handleError(event.error, 'global');
  });

  // Network offline
  window.addEventListener('offline', () => {
    console.warn('Network offline');
    showErrorUI('Netzwerk getrennt. Einige Funktionen sind möglicherweise nicht verfügbar.');
  });

  // Network online
  window.addEventListener('online', () => {
    console.log('Network restored');
    const { showSuccess } = require('./ui.js');
    showSuccess('Netzwerk wiederhergestellt');
  });
}

/**
 * Async error boundary for functions
 */
export async function withErrorHandling(fn, context = '') {
  try {
    return await fn();
  } catch (error) {
    handleError(error, context);
    throw error;
  }
}

/**
 * Check if user has internet connection
 */
export function isOnline() {
  return navigator.onLine;
}

/**
 * Wait for connection before retrying
 */
export async function waitForConnection(timeout = 30000) {
  if (isOnline()) return true;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('online', handler);
      resolve(false);
    }, timeout);

    const handler = () => {
      clearTimeout(timer);
      window.removeEventListener('online', handler);
      resolve(true);
    };

    window.addEventListener('online', handler);
  });
}

/**
 * Validate configuration
 */
export function validateConfig() {
  // CONFIG already imported at top of file

  if (!CONFIG.CLIENT_ID || CONFIG.CLIENT_ID.includes('YOUR_')) {
    throw new AppError(
      'CLIENT_ID nicht konfiguriert. Siehe config/config.js',
      'CONFIG_ERROR'
    );
  }

  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID.includes('YOUR_')) {
    throw new AppError(
      'SPREADSHEET_ID nicht konfiguriert. Siehe config/config.js',
      'CONFIG_ERROR'
    );
  }

  return true;
}
