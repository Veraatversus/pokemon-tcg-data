/**
 * Script Selector Module
 * 
 * Lädt alle verfügbaren Apps Scripts vom Benutzer (eigene + freigegebene)
 * Ermöglicht die Auswahl und speichert die Auswahl in Cookies
 */

class ScriptSelector {
  constructor() {
    this.scripts = [];
    this.currentSelection = null;
  }

  /**
   * Speichere die Auswahl in Cookies
   */
  saveSelection(scriptId, webAppUrl, spreadsheetId, scriptName) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 365); // 1 Jahr Gültigkeit
    
    const cookie = `path=/; expires=${expiryDate.toUTCString()}`;
    
    document.cookie = `pokemon_tcg_script_id=${encodeURIComponent(scriptId)}; ${cookie}`;
    document.cookie = `pokemon_tcg_web_app_url=${encodeURIComponent(webAppUrl)}; ${cookie}`;
    document.cookie = `pokemon_tcg_spreadsheet_id=${encodeURIComponent(spreadsheetId)}; ${cookie}`;
    document.cookie = `pokemon_tcg_script_name=${encodeURIComponent(scriptName)}; ${cookie}`;
    
    console.log(`✅ Selection saved to cookies: ${scriptName}`);
    
    this.currentSelection = {
      scriptId,
      webAppUrl,
      spreadsheetId,
      scriptName
    };
  }

  /**
   * Lade die Auswahl aus Cookies
   */
  loadSelection() {
    const cookies = document.cookie.split('; ').reduce((acc, cookie) => {
      const [key, value] = cookie.split('=');
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});

    // Prüfe ob alle erforderlichen Werte vorhanden sind
    const hasScriptId = cookies.pokemon_tcg_script_id && cookies.pokemon_tcg_script_id !== 'undefined';
    const hasWebAppUrl = cookies.pokemon_tcg_web_app_url && cookies.pokemon_tcg_web_app_url !== 'undefined';
    const hasSpreadsheetId = cookies.pokemon_tcg_spreadsheet_id && cookies.pokemon_tcg_spreadsheet_id !== 'undefined';
    
    if (hasScriptId && hasWebAppUrl && hasSpreadsheetId) {
      this.currentSelection = {
        scriptId: cookies.pokemon_tcg_script_id,
        webAppUrl: cookies.pokemon_tcg_web_app_url,
        spreadsheetId: cookies.pokemon_tcg_spreadsheet_id,
        scriptName: cookies.pokemon_tcg_script_name || 'Unknown'
      };
      console.log(`✅ Selection loaded from cookies: ${this.currentSelection.scriptName}`);
      console.log(`   📋 Spreadsheet ID: ${this.currentSelection.spreadsheetId.substring(0, 20)}...`);
      console.log(`   🌐 Web-App URL: ${this.currentSelection.webAppUrl.substring(0, 50)}...`);
      return this.currentSelection;
    }
    
    // Wenn etwas fehlt, lösche alle Cookies und fordere Neuauswahl
    if (hasScriptId || hasWebAppUrl || hasSpreadsheetId) {
      console.warn('⚠️ Incomplete cookie data found. Clearing cookies...');
      this.clearSelection();
    }
    
    return null;
  }

  /**
   * Extrahiere Script ID aus Web-App URL
   */
  extractScriptIdFromUrl(webAppUrl) {
    try {
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
   * Hole alle Apps Scripts des Benutzers von der Drive API
   */
  async loadScripts() {
    try {
      console.log('📥 Loading all Apps Scripts via Drive API...');
      
      const token = gapi.auth.getToken();
      if (!token || !token.access_token) {
        throw new Error('No access token available');
      }

      // Suche nach allen Apps Scripts (eigene + freigegebene)
      const query = encodeURIComponent("mimeType='application/vnd.google-apps.script'");
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,owners,parents,webViewLink)&pageSize=50`;
      
      console.log('🔗 Drive API Query URL:', url);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔍 Drive API Error Response:', errorText);
        throw new Error(`Drive API error ${response.status}`);
      }

      const data = await response.json();
      let allScripts = data.files || [];
      console.log(`📊 Found ${allScripts.length} total scripts via Drive API:`);
      
      // Zeige Details für jedes Script
      allScripts.forEach((script, idx) => {
        console.log(`  ${idx + 1}. ${script.name}`);
        console.log(`     ID: ${script.id}`);
        console.log(`     Owner: ${script.owners?.[0]?.displayName || 'Unknown'}`);
        console.log(`     Parents: ${script.parents?.join(', ') || 'None'}`);
        console.log(`     Link: ${script.webViewLink || 'None'}`);
      });
      
      this.scripts = allScripts;
      return this.scripts;
    } catch (error) {
      console.error('❌ Error loading scripts:', error.message);
      throw error;
    }
  }

  /**
   * Hole Script-Spreadsheet Zuordnungen
   * Durch Abfrage aller Spreadsheets und deren verknüpften Scripts
   */
  async findScriptSpreadsheetMappings() {
    try {
      console.log('🔍 Finding Script-Spreadsheet Mappings...');
      
      const token = gapi.auth.getToken();
      if (!token || !token.access_token) {
        throw new Error('No access token available');
      }

      // Finde alle Spreadsheets
      const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet'");
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=100`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Drive API error ${response.status}`);
      }

      const data = await response.json();
      const spreadsheets = data.files || [];
      console.log(`📊 Found ${spreadsheets.length} spreadsheets`);

      // Mapping: scriptId -> spreadsheetId
      const mappings = {};
      
      // Für jede Spreadsheet, versuche Script ID zu finden
      for (const sheet of spreadsheets) {
        try {
          // Versuche, den Named Range 'ScriptID' oder Sheet 'Config' zu lesen
          const sheetsResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheet.id}?fields=namedRanges,sheets.properties.title`,
            {
              headers: {
                'Authorization': `Bearer ${token.access_token}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (sheetsResponse.ok) {
            const sheetData = await sheetsResponse.json();
            
            // Suche nach Named Range, das auf ein Script ID hinweist
            if (sheetData.namedRanges) {
              for (const range of sheetData.namedRanges) {
                if (range.name === 'ScriptID' || range.name === 'APP_SCRIPT_ID') {
                  console.log(`  ✅ ${sheet.name} → Script verknüpft (via Named Range)`);
                  // Das ist nur eine Vermutung - wir könnten auch die Zelle lesen
                }
              }
            }

            // Prüfe, ob Sheet "Config" oder "Setup" existiert
            const hasConfigSheet = sheetData.sheets?.some(s => 
              s.properties.title.toLowerCase() === 'config' ||
              s.properties.title.toLowerCase() === 'setup' ||
              s.properties.title.toLowerCase() === 'configuration'
            );
            
            if (hasConfigSheet) {
              console.log(`  ℹ️  ${sheet.name} → hat Config-Sheet (Script könnte hier verknüpft sein)`);
              mappings[sheet.id] = { sheetName: sheet.name, hasConfig: true };
            }
          }
        } catch (error) {
          // Ignore individual sheet errors
          console.log(`  ⚠️  ${sheet.name} → konnte nicht prüfen`);
        }
      }

      return mappings;
    } catch (error) {
      console.error('❌ Error finding Script-Spreadsheet mappings:', error.message);
      return {};
    }
  }

  /**
   * Zeige das Auswahlmenü
   * Spreadsheet-zentrische Auswahl (pragmatischer Ansatz)
   */
  async showSelectionMenu() {
    try {
      console.log('🔧 Showing Script Selection Menu...');
      
      // Lade zuerst Spreadsheets (zuverlässiger als Scripts zu finden)
      console.log('📋 Loading user Spreadsheets...');
      const spreadsheets = await this.loadUserSpreadsheets();
      
      if (spreadsheets.length === 0) {
        throw new Error('Keine Google Sheets gefunden. Erstelle zuerst eine Spreadsheet.');
      }
      
      console.log(`✅ Found ${spreadsheets.length} Spreadsheets`);
      
      // Zeige Modal mit Spreadsheets zur Auswahl
      const menuHTML = this.createSpreadsheetMenuHTML(spreadsheets);
      const selectedSheet = await this.showModal(menuHTML, spreadsheets);
      
      if (!selectedSheet) {
        return null;
      }

      console.log(`✅ Selected Spreadsheet: ${selectedSheet.name}`);
      
      // Versuche, Script ID aus dieser Spreadsheet zu finden
      let scriptId = await this.getScriptIdFromSpreadsheet(selectedSheet.id);
      
      if (!scriptId) {
        // Fallback: Frage nach Script ID
        console.log('⚠️  Konnte Script ID nicht automatisch finden. Frag Benutzer...');
        scriptId = prompt(
          `📝 Gib die Apps Script ID für "${selectedSheet.name}" ein:\n\n` +
          'So findest du sie:\n' +
          '1. Öffne die Google Sheet\n' +
          '2. Extensions → Apps Script\n' +
          '3. Klick auf "Project Settings" (⚙️)\n' +
          '4. Kopiere die "Script ID"',
          ''
        );
        
        if (!scriptId || !scriptId.trim()) {
          throw new Error('Script ID erforderlich. Ohne Script ID kann die App nicht funktionieren.');
        }
        scriptId = scriptId.trim();
      } else {
        console.log(`✅ Found Script ID automatically: ${scriptId.substring(0, 20)}...`);
      }

      // Frage nach der deployed Web-App URL
      // Diese kann NICHT aus der Script ID konstruiert werden!
      console.log('📝 Frage nach Web-App URL...');
      const webAppUrl = prompt(
        `🌐 Gib die Web-App URL für "${selectedSheet.name}" ein:\n\n` +
        'So findest du sie:\n' +
        '1. Öffne das Apps Script (Extensions → Apps Script)\n' +
        '2. Klick auf "Deploy" → "Manage deployments"\n' +
        '3. Kopiere die "Web app" URL\n\n' +
        'Format: https://script.google.com/macros/s/{ID}/exec',
        ''
      );
      
      if (!webAppUrl || !webAppUrl.trim()) {
        throw new Error('Web-App URL erforderlich. Ohne diese URL kann die App keine Funktionen ausführen.');
      }
      
      // Speichere: scriptId, webAppUrl, spreadsheetId, spreadsheetName
      this.saveSelection(scriptId, webAppUrl.trim(), selectedSheet.id, selectedSheet.name);
      return this.currentSelection;
    } catch (error) {
      console.error('❌ Error in Script Selection:', error);
      alert('❌ Fehler: ' + error.message);
      return null;
    }
  }

  /**
   * Lade alle Spreadsheets des Benutzers
   */
  async loadUserSpreadsheets() {
    try {
      console.log('📥 Loading Spreadsheets via Drive API...');
      
      const token = gapi.auth.getToken();
      if (!token || !token.access_token) {
        throw new Error('No access token available');
      }

      // Suche nach allen Spreadsheets (eigene + freigegebene)
      const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet'");
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,owners,webViewLink)&pageSize=50`;
      
      console.log('🔗 Drive API Query URL:', url);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔍 Drive API Error Response:', errorText);
        throw new Error(`Drive API error ${response.status}`);
      }

      const data = await response.json();
      let allSheets = data.files || [];
      console.log(`📊 Found ${allSheets.length} total Spreadsheets:`);
      
      // Zeige Details für jede Spreadsheet
      allSheets.forEach((sheet, idx) => {
        console.log(`  ${idx + 1}. ${sheet.name}`);
        console.log(`     ID: ${sheet.id}`);
        console.log(`     Owner: ${sheet.owners?.[0]?.displayName || 'Unknown'}`);
      });
      
      return allSheets;
    } catch (error) {
      console.error('❌ Error loading spreadsheets:', error.message);
      throw error;
    }
  }

  /**
   * Finde Script ID durch Spreadsheet
   * Liest aus Extended Properties oder anderen Quellen
   */
  async getScriptIdFromSpreadsheet(spreadsheetId) {
    try {
      console.log(`🔍 Trying to find Script ID for Spreadsheet ${spreadsheetId.substring(0, 20)}...`);
      
      const token = gapi.auth.getToken();
      if (!token || !token.access_token) {
        return null;
      }

      // Methode 1: Prüfe Spreadsheet Properties
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.spreadsheetId,spreadsheetId,properties.spreadsheetUrl`,
        {
          headers: {
            'Authorization': `Bearer ${token.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('📋 Spreadsheet Properties:', data);
        // In den Properties ist die spreadsheet ID, aber nicht die Script ID
        // Das ist ein Dead End - kann nicht direkt rauslesen
      }

      // Methode 2: Suche in Drive nach Script, das diese Spreadsheet als Parent hat
      const query = encodeURIComponent(`'${spreadsheetId}' in parents and mimeType='application/vnd.google-apps.script'`);
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=10`;
      
      console.log(`🔗 Searching for Scripts in Folder: ${searchUrl.substring(0, 100)}...`);
      
      const searchResponse = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${token.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        const childScripts = searchData.files || [];
        
        if (childScripts.length > 0) {
          console.log(`✅ Found ${childScripts.length} Scripts as children of this Spreadsheet:`);
          childScripts.forEach(script => {
            console.log(`  - ${script.name} (${script.id})`);
          });
          return childScripts[0].id; // Return first one
        }
      }

      return null;
    } catch (error) {
      console.warn('⚠️ Could not find Script ID:', error.message);
      return null;
    }
  }
  async findSpreadsheetWithScripts() {
    try {
      console.log('🔍 Searching for Spreadsheets with possible Scripts...');
      
      const token = gapi.auth.getToken();
      if (!token || !token.access_token) {
        throw new Error('No access token available');
      }

      // Finde alle Spreadsheets
      const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet'");
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,owners,webViewLink)&pageSize=50`;
      
      console.log('🔗 Finding Spreadsheets...');

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Drive API error ${response.status}`);
      }

      const data = await response.json();
      let spreadsheets = data.files || [];
      
      console.log(`📊 Found ${spreadsheets.length} spreadsheets. Checking for Scripts...`);

      // Filter: nur Spreadsheets die "Script" oder "App" im Namen haben
      // oder die einen Extended Properties Script-ID haben
      const filteredSheets = [];
      
      for (const sheet of spreadsheets) {
        try {
          // Versuche, Spreadsheet Metadata zu lesen um verknüpfte Scripts zu finden
          const metaResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheet.id}?fields=properties(title),namedRanges`,
            {
              headers: {
                'Authorization': `Bearer ${token.access_token}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (metaResponse.ok) {
            const metaData = await metaResponse.json();
            
            // Prüfe, ob Spreadsheet einen Namen hat, der ein Script sein könnte
            // oder ob es Named Ranges für Scripts hat
            const hasScriptIndication = 
              sheet.name.toLowerCase().includes('script') ||
              sheet.name.toLowerCase().includes('tcg') ||
              sheet.name.toLowerCase().includes('drecks') ||
              metaData.namedRanges?.some(r => 
                r.name.toLowerCase().includes('script') ||
                r.name.toLowerCase().includes('appscript')
              );

            if (hasScriptIndication) {
              console.log(`  ✅ ${sheet.name} → Wahrscheinlich mit Script verknüpft`);
              filteredSheets.push({
                id: sheet.id,
                name: sheet.name,
                spreadsheetId: sheet.id, // Ist selbst die Spreadsheet
                owners: sheet.owners,
                isSpreadsheet: true
              });
            }
          }
        } catch (error) {
          // Ignore errors, continue
        }
      }

      return filteredSheets;
    } catch (error) {
      console.error('❌ Error finding spreadsheets:', error.message);
      return [];
    }
  }

  /**
   * Erstelle HTML für Spreadsheet Auswahl
   */
  createSpreadsheetMenuHTML(spreadsheets) {
    let html = `
      <style>
        #script-selection-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }

        .script-selection-modal {
          background: white;
          border-radius: 12px;
          padding: 30px;
          max-width: 600px;
          width: 90%;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
          max-height: 80vh;
          overflow-y: auto;
        }

        .script-selection-modal h1 {
          margin: 0 0 30px 0;
          color: #333;
          font-size: 28px;
        }

        .script-selection-modal p {
          margin: 0 0 20px 0;
          color: #666;
          font-size: 14px;
        }

        .script-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .script-item {
          padding: 15px;
          margin-bottom: 10px;
          border: 2px solid #eee;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .script-item:hover {
          border-color: #4285f4;
          background: #f8f9fa;
          transform: translateX(5px);
        }

        .script-item.selected {
          border-color: #34a853;
          background: #e8f5e9;
        }

        .script-name {
          font-weight: 600;
          color: #333;
          margin-bottom: 5px;
        }

        .script-meta {
          font-size: 12px;
          color: #999;
        }

        .script-checkbox {
          width: 24px;
          height: 24px;
          cursor: pointer;
        }

        .modal-buttons {
          margin-top: 30px;
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }

        .modal-btn {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .modal-btn.primary {
          background: #4285f4;
          color: white;
        }

        .modal-btn.primary:hover {
          background: #357ae8;
        }

        .modal-btn.primary:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .modal-btn.secondary {
          background: #f0f0f0;
          color: #333;
        }

        .modal-btn.secondary:hover {
          background: #e0e0e0;
        }

        @media (prefers-color-scheme: dark) {
          .script-selection-modal {
            background: #1e1e1e;
            color: #e0e0e0;
          }

          .script-selection-modal h1 {
            color: #e0e0e0;
          }

          .script-selection-modal p {
            color: #b0b0b0;
          }

          .script-item {
            border-color: #333;
          }

          .script-item:hover {
            background: #2a2a2a;
          }

          .script-item.selected {
            background: #1b4620;
          }

          .script-name {
            color: #e0e0e0;
          }

          .modal-btn.secondary {
            background: #333;
            color: #e0e0e0;
          }

          .modal-btn.secondary:hover {
            background: #444;
          }
        }
      </style>

      <div id="script-selection-overlay">
        <div class="script-selection-modal">
          <h1>🎮 Pokémon TCG Tracker</h1>
          <p>Wähle deine Google Sheet aus:</p>
          
          <ul class="script-list" id="script-list">
            ${spreadsheets.map((sheet, index) => `
              <li class="script-item" data-script-id="${sheet.id}" data-index="${index}">
                <div>
                  <div class="script-name">📊 ${sheet.name}</div>
                  <div class="script-meta">ID: ${sheet.id.substring(0, 20)}...</div>
                  <div class="script-meta">Owner: ${sheet.owners?.[0]?.displayName || 'Unknown'}</div>
                </div>
                <input type="radio" name="script-selection" value="${sheet.id}" class="script-checkbox" />
              </li>
            `).join('')}
          </ul>

          <div class="modal-buttons">
            <button class="modal-btn secondary" id="cancel-btn">Abbrechen</button>
            <button class="modal-btn primary" id="select-btn" disabled>Auswählen</button>
          </div>
        </div>
      </div>
    `;

    return html;
  }

  /**
   * Erstelle das HTML für das Auswahlmenü
   */
  createMenuHTML(scripts) {
    let html = `
      <style>
        #script-selection-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }

        .script-selection-modal {
          background: white;
          border-radius: 12px;
          padding: 30px;
          max-width: 600px;
          width: 90%;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
          max-height: 80vh;
          overflow-y: auto;
        }

        .script-selection-modal h1 {
          margin: 0 0 30px 0;
          color: #333;
          font-size: 28px;
        }

        .script-selection-modal p {
          margin: 0 0 20px 0;
          color: #666;
          font-size: 14px;
        }

        .script-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .script-item {
          padding: 15px;
          margin-bottom: 10px;
          border: 2px solid #eee;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .script-item:hover {
          border-color: #4285f4;
          background: #f8f9fa;
          transform: translateX(5px);
        }

        .script-item.selected {
          border-color: #34a853;
          background: #e8f5e9;
        }

        .script-name {
          font-weight: 600;
          color: #333;
          margin-bottom: 5px;
        }

        .script-meta {
          font-size: 12px;
          color: #999;
        }

        .script-checkbox {
          width: 24px;
          height: 24px;
          cursor: pointer;
        }

        .modal-buttons {
          margin-top: 30px;
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }

        .modal-btn {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .modal-btn.primary {
          background: #4285f4;
          color: white;
        }

        .modal-btn.primary:hover {
          background: #357ae8;
        }

        .modal-btn.primary:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .modal-btn.secondary {
          background: #f0f0f0;
          color: #333;
        }

        .modal-btn.secondary:hover {
          background: #e0e0e0;
        }

        @media (prefers-color-scheme: dark) {
          .script-selection-modal {
            background: #1e1e1e;
            color: #e0e0e0;
          }

          .script-selection-modal h1 {
            color: #e0e0e0;
          }

          .script-selection-modal p {
            color: #b0b0b0;
          }

          .script-item {
            border-color: #333;
          }

          .script-item:hover {
            background: #2a2a2a;
          }

          .script-item.selected {
            background: #1b4620;
          }

          .script-name {
            color: #e0e0e0;
          }

          .modal-btn.secondary {
            background: #333;
            color: #e0e0e0;
          }

          .modal-btn.secondary:hover {
            background: #444;
          }
        }
      </style>

      <div id="script-selection-overlay">
        <div class="script-selection-modal">
          <h1>🎮 Pokémon TCG Selector</h1>
          <p>Wähle das Script aus (danach wird nach der Spreadsheet-ID gefragt):</p>
          
          <ul class="script-list" id="script-list">
            ${scripts.map((script, index) => `
              <li class="script-item" data-script-id="${script.id}" data-index="${index}">
                <div>
                  <div class="script-name">📋 ${script.name}</div>
                  <div class="script-meta">Script ID: ${script.id.substring(0, 20)}...</div>
                </div>
                <input type="radio" name="script-selection" value="${script.id}" class="script-checkbox" />
              </li>
            `).join('')}
          </ul>

          <div class="modal-buttons">
            <button class="modal-btn secondary" id="cancel-btn">Abbrechen</button>
            <button class="modal-btn primary" id="select-btn" disabled>Auswählen</button>
          </div>
        </div>
      </div>
    `;

    return html;
  }

  /**
   * Zeige das Modal und warte auf Auswahl
   */
  showModal(html, scripts) {
    return new Promise((resolve) => {
      // Füge HTML ein
      document.body.insertAdjacentHTML('beforeend', html);

      const overlay = document.getElementById('script-selection-overlay');
      const scriptList = document.getElementById('script-list');
      const selectBtn = document.getElementById('select-btn');
      const cancelBtn = document.getElementById('cancel-btn');
      const items = document.querySelectorAll('.script-item');

      let selectedScriptId = null;

      // Click Handler für Script Items
      items.forEach(item => {
        item.addEventListener('click', () => {
          // Entferne selected von allen
          items.forEach(i => i.classList.remove('selected'));
          // Füge selected zum geklickten hinzu
          item.classList.add('selected');
          
          const radio = item.querySelector('input[type="radio"]');
          radio.checked = true;
          selectedScriptId = radio.value;
          
          selectBtn.disabled = false;
        });
      });

      // Select Button
      selectBtn.addEventListener('click', () => {
        const script = scripts.find(s => s.id === selectedScriptId);
        overlay.remove();
        resolve(script);
      });

      // Cancel Button
      cancelBtn.addEventListener('click', () => {
        overlay.remove();
        resolve(null);
      });

      // ESC zum Schließen
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          overlay.remove();
          resolve(null);
        }
      });
    });
  }

  /**
   * Gebe die aktuelle Auswahl zurück
   */
  getSelection() {
    return this.currentSelection;
  }

  /**
   * Lösche die gespeicherte Auswahl (z.B. zum Neu-Auswählen)
   */
  clearSelection() {
    document.cookie = 'pokemon_tcg_script_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = 'pokemon_tcg_web_app_url=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = 'pokemon_tcg_spreadsheet_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = 'pokemon_tcg_script_name=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    
    this.currentSelection = null;
    console.log('🗑️ Selection cleared');
  }
}

export const scriptSelector = new ScriptSelector();
