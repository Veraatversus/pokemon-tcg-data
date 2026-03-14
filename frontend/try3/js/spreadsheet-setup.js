/**
 * Spreadsheet Setup Module
 * 
 * Erlaubt dem Benutzer:
 * 1. Eine Spreadsheet auszuwählen (Google Drive Picker)
 * 2. Die Script ID zu konfigurieren
 * 3. Alles in localStorage zu speichern
 */

const PICKER_API_KEY = 'REDACTED_GOOGLE_API_KEY'; // Dein API Key
const PICKER_CLIENT_ID = 'REDACTED_GOOGLE_CLIENT_ID'; // Dein Client ID

class SpreadsheetSetup {
  constructor() {
    this.currentSpreadsheetId = localStorage.getItem('pokemon-tcg-spreadsheet-id') || '';
    this.currentWebAppUrl = localStorage.getItem('pokemon-tcg-web-app-url') || '';
  }

  /**
   * Lade die Google Picker API
   */
  loadPickerAPI() {
    return new Promise((resolve, reject) => {
      gapi.load('picker', { 'callback': resolve });
    });
  }

  /**
   * Öffne den Google Drive Picker um eine Spreadsheet auszuwählen
   */
  async openSpreadsheetPicker() {
    try {
      await this.loadPickerAPI();

      const accessToken = gapi.auth.getToken()?.access_token;
      if (!accessToken) {
        console.error('❌ No access token available');
        return null;
      }

      const picker = new google.picker.PickerBuilder()
        .addView(google.picker.ViewId.SPREADSHEETS)
        .setOAuthToken(accessToken)
        .setDeveloperKey(PICKER_API_KEY)
        .setCallback((data) => this.handlePickerResult(data))
        .build();

      picker.setVisible(true);
    } catch (error) {
      console.error('❌ Error opening picker:', error);
    }
  }

  /**
   * Handle das Picker Ergebnis
   */
  handlePickerResult(data) {
    if (data.action === google.picker.Action.PICKED) {
      const file = data.docs[0];
      const spreadsheetId = file.id;
      const spreadsheetName = file.getName();

      console.log(`✅ Selected spreadsheet: ${spreadsheetName} (${spreadsheetId})`);
      
      // Speichere die Spreadsheet ID
      localStorage.setItem('pokemon-tcg-spreadsheet-id', spreadsheetId);
      this.currentSpreadsheetId = spreadsheetId;

      // Versuche die Script ID aus den Spreadsheet Properties zu laden
      this.loadScriptIdFromSpreadsheet(spreadsheetId);
    }
  }

  /**
   * Extrahiere Script ID aus Web-App URL
   */
  extractScriptIdFromUrl(webAppUrl) {
    try {
      // Web-App URL Format: https://script.googleapis.com/macros/s/{SCRIPT_ID}/usercodeappscript
      const match = webAppUrl.match(/\/macros\/s\/([^\/]+)\//);
      if (match && match[1]) {
        return match[1];
      }
    } catch (error) {
      console.warn('⚠️ Could not extract Script ID from URL:', error);
    }
    return null;
  }

  /**
   * Hole die Spreadsheet ID (parentId) über die Apps Script API
   */
  async getSpreadsheetIdFromScript(webAppUrl) {
    try {
      const scriptId = this.extractScriptIdFromUrl(webAppUrl);
      
      if (!scriptId) {
        console.warn('⚠️ Could not extract Script ID from Web-App URL');
        return null;
      }

      console.log(`🔍 Extracting Script ID from Web-App: ${scriptId.substring(0, 20)}...`);

      const token = gapi.auth.getToken();
      if (!token || !token.access_token) {
        console.warn('⚠️ No access token for Apps Script API call');
        return null;
      }

      // Rufe Apps Script API auf
      const response = await fetch(
        `https://script.googleapis.com/v1/projects/${scriptId}`,
        {
          headers: {
            'Authorization': `Bearer ${token.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        console.warn(`⚠️ Apps Script API returned ${response.status}: ${response.statusText}`);
        return null;
      }

      const project = await response.json();
      
      if (project.parentId) {
        console.log(`✅ Found associated Spreadsheet: ${project.parentId}`);
        return project.parentId;
      } else {
        console.warn('⚠️ Script has no associated Spreadsheet (it\'s standalone)');
        return null;
      }
    } catch (error) {
      console.warn('⚠️ Could not retrieve Spreadsheet ID from Script:', error.message);
      return null;
    }
  }

  /**
   * Speichere die Script ID in die Spreadsheet
   */
  async saveScriptIdToSpreadsheet(spreadsheetId, scriptId) {
    try {
      console.log('💾 Saving Script ID to Spreadsheet Config...');
      
      const token = gapi.auth.getToken();
      if (!token || !token.access_token) {
        console.warn('⚠️ No access token for Sheets API call');
        return false;
      }
      
      // Use direct HTTP request for better debugging
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Config!A1?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [[scriptId]]
          })
        }
      );
      
      if (!response.ok) {
        console.warn(`⚠️ Sheets API returned ${response.status}: ${response.statusText}`);
        return false;
      }

      console.log(`✅ Script ID saved to Spreadsheet`);
      return true;
    } catch (error) {
      console.warn('⚠️ Could not save Script ID to Spreadsheet:', error.message);
      return false;
    }
  }

  /**
   * Zeige einen Dialog um die Script ID einzugeben
   */
  showScriptIdDialog() {
    const scriptId = prompt(
      '📝 Gib die Apps Script ID ein:\n\n' +
      'So findest du sie:\n' +
      '1. Gehe in Google Sheets\n' +
      '2. Extensions → Apps Script\n' +
      '3. Click "Project Settings"\n' +
      '4. Copy die "Script ID"',
      this.currentScriptId
    );

    if (scriptId && scriptId.trim()) {
      localStorage.setItem('pokemon-tcg-script-id', scriptId.trim());
      this.currentScriptId = scriptId.trim();
      console.log(`✅ Script ID gespeichert: ${this.currentScriptId}`);
    }
  }

  /**
   * Öffne den Setup Dialog (Web-App URL → automatisch Spreadsheet finden)
   */
  async openSetupDialog() {
    console.log('🔧 Opening Setup Dialog...');
    
    // Step 1: Ask for Web-App URL
    console.log('🌐 Asking for Web-App URL...');
    const webAppUrl = prompt(
      '🌐 Gib die Web-App URL ein:\n\n' +
      'So findest du sie:\n' +
      '1. Öffne deine Spreadsheet\n' +
      '2. Extensions → Apps Script\n' +
      '3. Click "Deploy" (oben rechts)\n' +
      '4. Wähle die bestehende Deployment oder erstelle neue\n' +
      '5. Kopiere die "Deployment URL" (mit /exec am Ende)\n\n' +
      'Beispiel:\n' +
      'https://script.googleapis.com/macros/s/1-Tri6majOESIui9kqluz4LAALnYZvcMBPaWR63XVf_UBz8HasM52LfJe/usercodeappscript',
      this.currentWebAppUrl
    );
    
    if (!webAppUrl || !webAppUrl.trim()) {
      console.warn('❌ User cancelled Web-App URL input');
      return;
    }
    
    const cleanWebAppUrl = webAppUrl.trim();
    localStorage.setItem('pokemon-tcg-web-app-url', cleanWebAppUrl);
    this.currentWebAppUrl = cleanWebAppUrl;
    console.log(`✅ Web-App URL saved`);
    
    // Step 2: Try to automatically find Spreadsheet ID from the Script
    console.log('🔍 Attempting to find Spreadsheet from Script...');
    const autoSpreadsheetId = await this.getSpreadsheetIdFromScript(cleanWebAppUrl);
    
    if (autoSpreadsheetId) {
      // Auto-found Spreadsheet
      localStorage.setItem('pokemon-tcg-spreadsheet-id', autoSpreadsheetId);
      this.currentSpreadsheetId = autoSpreadsheetId;
      alert(`✅ Setup erfolgreich abgeschlossen!\n\n✨ Spreadsheet wurde automatisch gefunden!\n\nSpreadsheet: ${this.currentSpreadsheetId}\nWeb-App: ${this.currentWebAppUrl.substring(0, 50)}...\n\nDu kannst jetzt Sets importieren!`);
      return;
    }
    
    // Step 3: If auto-detection failed, ask user to enter Spreadsheet ID manually
    console.log('⚠️ Could not automatically find Spreadsheet, asking user...');
    const spreadsheetId = prompt(
      '📊 Gib die Spreadsheet ID ein:\n\n' +
      '(Automatisches Finden hat nicht funktioniert - das ist normal für freigegebene Scripts)\n\n' +
      'Du findest sie in der URL: https://docs.google.com/spreadsheets/d/[HIER]/edit',
      this.currentSpreadsheetId
    );
    
    if (!spreadsheetId || !spreadsheetId.trim()) {
      console.warn('❌ User cancelled Spreadsheet ID input');
      return;
    }
    
    const cleanSpreadsheetId = spreadsheetId.trim();
    localStorage.setItem('pokemon-tcg-spreadsheet-id', cleanSpreadsheetId);
    this.currentSpreadsheetId = cleanSpreadsheetId;
    console.log(`✅ Spreadsheet ID saved locally: ${this.currentSpreadsheetId}`);
    
    alert(`✅ Setup erfolgreich abgeschlossen!\n\nSpreadsheet: ${this.currentSpreadsheetId}\nWeb-App: ${this.currentWebAppUrl.substring(0, 50)}...\n\nDu kannst jetzt Sets importieren!`);
  }

  /**
   * Update den Setup Dialog mit aktuellen Werten
   */
  updateSetupDialog() {
    const spreadsheetEl = document.getElementById('current-spreadsheet');
    const scriptEl = document.getElementById('current-script');

    if (spreadsheetEl) {
      spreadsheetEl.textContent = this.currentSpreadsheetId 
        ? `✅ ${this.currentSpreadsheetId}` 
        : '❌ Keine Spreadsheet gewählt';
    }

    if (scriptEl) {
      scriptEl.textContent = this.currentScriptId 
        ? `✅ ${this.currentScriptId}` 
        : '❌ Keine Script ID gespeichert';
    }
  }

  /**
   * Validiere ob Setup komplett ist
   */
  validateSetup() {
    if (!this.currentSpreadsheetId || !this.currentWebAppUrl) {
      console.warn('⚠️ Setup not complete. Please configure spreadsheet and Web-App URL.');
      return false;
    }
    console.log('✅ Setup complete!');
    return true;
  }

  /**
   * Setze die Spreadsheet ID
   */
  setSpreadsheetId(spreadsheetId) {
    localStorage.setItem('pokemon-tcg-spreadsheet-id', spreadsheetId);
    this.currentSpreadsheetId = spreadsheetId;
    console.log(`✅ Spreadsheet ID updated: ${spreadsheetId}`);
  }

  /**
   * Setze die Web-App URL
   */
  setWebAppUrl(webAppUrl) {
    localStorage.setItem('pokemon-tcg-web-app-url', webAppUrl);
    this.currentWebAppUrl = webAppUrl;
    console.log(`✅ Web-App URL updated`);
  }

  /**
   * Gebe die aktuelle Spreadsheet ID zurück
   */
  getSpreadsheetId() {
    return this.currentSpreadsheetId;
  }

  /**
   * Gebe die aktuelle Web-App URL zurück
   */
  getWebAppUrl() {
    return this.currentWebAppUrl;
  }

  /**
   * Gebe die aktuelle Script ID zurück (für Rückwärtskompatibilität)
   */
  getScriptId() {
    // Deprecated: Use getWebAppUrl instead
    return this.currentWebAppUrl;
  }

  /**
   * Füge Styles für den Setup Dialog hinzu
   */
  addSetupStyles() {
    if (document.getElementById('setup-styles')) return;

    const style = document.createElement('style');
    style.id = 'setup-styles';
    style.textContent = `
      #spreadsheet-setup-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }

      .setup-dialog {
        background: white;
        border-radius: 8px;
        padding: 30px;
        max-width: 500px;
        width: 90%;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      }

      .setup-dialog h2 {
        margin: 0 0 20px 0;
        color: #333;
        font-size: 24px;
      }

      .setup-section {
        margin-bottom: 25px;
        padding-bottom: 25px;
        border-bottom: 1px solid #eee;
      }

      .setup-section:last-child {
        border-bottom: none;
      }

      .setup-section h3 {
        margin: 0 0 10px 0;
        color: #555;
        font-size: 16px;
      }

      .setup-label {
        margin: 5px 0;
        font-size: 12px;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .setup-value {
        margin: 5px 0 15px 0;
        padding: 8px 12px;
        background: #f5f5f5;
        border-radius: 4px;
        font-family: monospace;
        font-size: 12px;
        color: #333;
        word-break: break-all;
      }

      .setup-btn {
        display: block;
        width: 100%;
        padding: 12px;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
      }

      .setup-btn.primary {
        background: #4285f4;
        color: white;
        margin-bottom: 10px;
      }

      .setup-btn.primary:hover {
        background: #357ae8;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      }

      .setup-btn.success {
        background: #34a853;
        color: white;
      }

      .setup-btn.success:hover {
        background: #2d8e47;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      }

      .setup-hint {
        margin-top: 8px;
        font-size: 11px;
        color: #888;
        font-style: italic;
      }

      @media (prefers-color-scheme: dark) {
        .setup-dialog {
          background: #1e1e1e;
          color: #e0e0e0;
        }

        .setup-dialog h2 {
          color: #e0e0e0;
        }

        .setup-section h3 {
          color: #b0b0b0;
        }

        .setup-value {
          background: #2a2a2a;
          color: #b0b0b0;
        }
      }
    `;

    document.head.appendChild(style);
  }
}

export const spreadsheetSetup = new SpreadsheetSetup();
