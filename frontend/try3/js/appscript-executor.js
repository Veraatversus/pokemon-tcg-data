/**
 * Google Apps Script Web-App Module
 * 
 * Ruft Funktionen über die Web-App URL auf
 * (funktioniert mit allen Scripts, egal wem sie gehören)
 */

import { spreadsheetSetup } from './spreadsheet-setup.js';

/**
 * Execute an Apps Script function via Web-App endpoint
 */
async function executeAppScriptFunction(functionName, params = []) {
  try {
    const webAppUrl = spreadsheetSetup.getWebAppUrl();
    
    if (!webAppUrl) {
      throw new Error('❌ Web-App URL not configured. Please run setup first.');
    }

    console.log(`📞 Calling Apps Script function: ${functionName}(${params.join(', ')})`);
    console.log(`🌐 Using Web-App: ${webAppUrl.substring(0, 50)}...`);
    
    // Get OAuth token for authorization
    const token = gapi.auth.getToken();
    if (!token || !token.access_token) {
      throw new Error('❌ No access token available. Please sign in first.');
    }
    
    // Make request to Web-App with Authorization header
    const response = await fetch(webAppUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        function: functionName,
        parameters: params
      })
    });

    // Web-App returns text response
    const responseText = await response.text();
    let result;
    
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      // If response is not JSON, it might be an error message
      console.warn('⚠️ Non-JSON response from Web-App:', responseText);
      result = { 
        success: !response.ok, 
        message: responseText 
      };
    }

    if (!response.ok || result.error) {
      const errorMsg = result.error?.message || result.message || result.error || responseText;
      
      if (response.status === 404) {
        console.error(`❌ Web-App not found! URL: ${webAppUrl}`);
        throw new Error(`❌ Web-App URL ungültig!\n\nBitte überprüfe die Web-App URL in der Konfiguration.`);
      }
      
      if (response.status === 403 || response.status === 401) {
          console.error(`❌ Access denied! Status: ${response.status}`);
          throw new Error(
            `❌ Zugriff verweigert (${response.status})!\n\n` +
            `Die Web-App muss richtig deployed sein:\n\n` +
            `1. Apps Script öffnen (Extensions → Apps Script)\n` +
            `2. Deploy → New deployment\n` +
            `3. Type: Web app\n` +
            `4. Execute as: Me\n` +
            `5. Who has access: Anyone\n\n` +
            `Dann kopiere die neue Web-App URL und aktualisiere die Auswahl.`
          );
      }
      
      throw new Error(errorMsg || 'Web-App execution failed');
    }

    console.log(`✅ ${functionName} executed successfully:`, result);
    return result.response || result;
  } catch (error) {
    console.error(`❌ Error executing ${functionName}:`, error);
    throw error;
  }
}

/**
 * Setup and import all sets (equivalent to setupAndImportAllSets)
 */
export async function importAllSets() {
  return await executeAppScriptFunction('setupAndImportAllSets');
}

/**
 * Import a single set (equivalent to promptAndPopulateCardsForSet)
 */
export async function importSingleSet(setId) {
  return await executeAppScriptFunction('promptAndPopulateCardsForSet', [setId]);
}

/**
 * Reimport a set (equivalent to reimportCurrentSet)
 */
export async function reimportSet(setId) {
  return await executeAppScriptFunction('reimportCurrentSet', [setId]);
}

/**
 * Batch import sets
 */
export async function batchImportSets(setIds) {
  return await executeAppScriptFunction('batchImportSets', [setIds]);
}

/**
 * Delete a set
 */
export async function deleteSet(setId) {
  return await executeAppScriptFunction('deleteCurrentSet', [setId]);
}

/**
 * Sort a set
 */
export async function sortSet(setId) {
  return await executeAppScriptFunction('manualSortCurrentSheet', [setId]);
}

/**
 * Sort all sets
 */
export async function sortAllSets() {
  return await executeAppScriptFunction('manualSortAllSheets');
}

/**
 * Export collection to CSV
 */
export async function exportToCSV() {
  return await executeAppScriptFunction('exportCollectionToCSV');
}

/**
 * Get quick stats
 */
export async function getQuickStats() {
  return await executeAppScriptFunction('showQuickStats');
}

/**
 * Update collection summary
 */
export async function updateCollectionSummary() {
  return await executeAppScriptFunction('updateCollectionSummary');
}

/**
 * Initialize the Apps Script execution
 * Note: We use direct HTTP requests to the Execution API,
 * so we don't need to load gapi.client.script
 */
export async function initializeAppsScriptAPI() {
  console.log('✅ Apps Script Execution module ready (using direct HTTP)');
  return Promise.resolve();
}
