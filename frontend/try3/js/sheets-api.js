import { CONFIG } from '../config/config.js';

/**
 * Extract image URL from IMAGE formula
 * Handles format: =IMAGE("https://...; 1)
 * @param {string} formulaOrValue - IMAGE formula or direct URL
 * @returns {string|null} - Extracted URL or null
 */
export function extractImageURL(formulaOrValue) {
  if (!formulaOrValue) return null;
  
  const str = String(formulaOrValue).trim();
  
  // Match IMAGE("url"; 1) pattern (with semicolon as separator in German locale)
  const match = str.match(/IMAGE\("([^"]+)"/);
  if (match && match[1]) {
    return match[1];
  }
  
  // Check if it's already a URL
  if (str.startsWith('http')) {
    return str;
  }
  
  return null;
}

/**
 * Extract cardmarket link from HYPERLINK formula
 * Handles format: =HYPERLINK("https://..."; "CM")
 * @param {string} formulaOrValue - HYPERLINK formula
 * @returns {string|null} - Extracted URL or null
 */
export function extractCardmarketLink(formulaOrValue) {
  if (!formulaOrValue) return null;
  
  const str = String(formulaOrValue).trim();
  
  // Match HYPERLINK("url"; "text") pattern
  const match = str.match(/HYPERLINK\("([^"]+)"/);
  if (match && match[1]) {
    return match[1];
  }
  
  // Check if it's already a URL
  if (str.startsWith('http')) {
    return str;
  }
  
  return null;
}

/**
 * API Error Handler
 */
function handleAPIError(error, context) {
  console.error(`[${context}] API Error:`, error);

  if (error.status === 401) {
    throw new Error('Authentifizierung erforderlich. Bitte melden Sie sich erneut an.');
  } else if (error.status === 403) {
    throw new Error('Zugriff verweigert. Überprüfen Sie die Freigabeeinstellungen der Tabelle.');
  } else if (error.status === 404) {
    throw new Error('Ressource nicht gefunden. Überprüfen Sie die Spreadsheet-ID.');
  } else if (error.status >= 500) {
    throw new Error('Google Sheets API-Fehler. Bitte versuchen Sie es später erneut.');
  }

  throw error;
}

/**
 * Read data from Google Sheets
 * @param {string} range - A1 notation range (e.g., "Sets Overview!A1:Z100")
 * @returns {Promise<Array>} - 2D array of cell values
 */
export async function readSheet(range) {
  try {
    if (!range) throw new Error('Range ist erforderlich');
    
    // Get spreadsheet ID dynamically
    const spreadsheetId = window.getCurrentSpreadsheetId ? window.getCurrentSpreadsheetId() : CONFIG.SPREADSHEET_ID;
    if (!spreadsheetId) throw new Error('Spreadsheet-ID nicht konfiguriert');

    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: range,
      valueRenderOption: 'FORMULA' // Get formulas as text, not calculated values
    });
    
    return response.result.values || [];
  } catch (error) {
    handleAPIError(error, `readSheet(${range})`);
  }
}

/**
 * Write data to Google Sheets
 * @param {string} range - A1 notation range
 * @param {Array} values - 2D array of values to write
 */
export async function writeSheet(range, values) {
  try {
    if (!range) throw new Error('Range ist erforderlich');
    if (!values) throw new Error('Values sind erforderlich');

    // Get spreadsheet ID dynamically
    const spreadsheetId = window.getCurrentSpreadsheetId ? window.getCurrentSpreadsheetId() : CONFIG.SPREADSHEET_ID;

    const response = await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: range,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: values,
      },
    });
    return response.result;
  } catch (error) {
    handleAPIError(error, `writeSheet(${range})`);
  }
}

/**
 * Batch read multiple ranges
 * @param {Array<string>} ranges - Array of A1 notation ranges
 * @returns {Promise<Array>} - Array of value ranges
 */
export async function batchReadSheet(ranges) {
  try {
    if (!ranges || ranges.length === 0) throw new Error('Ranges sind erforderlich');

    const response = await gapi.client.sheets.spreadsheets.values.batchGet({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      ranges: ranges,
    });
    return response.result.valueRanges;
  } catch (error) {
    handleAPIError(error, `batchReadSheet(${ranges.length} ranges)`);
  }
}

/**
 * Batch write to multiple ranges
 * @param {Array} data - Array of {range, values} objects
 */
export async function batchWriteSheet(data) {
  try {
    const response = await gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      resource: {
        valueInputOption: 'USER_ENTERED',
        data: data,
      },
    });
    return response.result;
  } catch (error) {
    console.error('Error batch writing:', error);
    throw error;
  }
}

/**
 * Update checkbox state in sheet
 * @param {string} sheetName - Name of the sheet
 * @param {number} row - Row number (1-indexed)
 * @param {number} col - Column number (1-indexed)
 * @param {boolean} checked - Checkbox state
 */
export async function updateCheckbox(sheetName, row, col, checked) {
  const range = `${sheetName}!${columnToLetter(col)}${row}`;
  await writeSheet(range, [[checked]]);
}

/**
 * Get all sheets in spreadsheet
 * @returns {Promise<Array>} - Array of sheet info objects
 */
export async function getAllSheets() {
  try {
    const response = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
    });
    return response.result.sheets.map(sheet => ({
      id: sheet.properties.sheetId,
      title: sheet.properties.title,
      index: sheet.properties.index,
    }));
  } catch (error) {
    console.error('Error getting sheets:', error);
    throw error;
  }
}

/**
 * Helper: Convert column number to letter (1 = A, 2 = B, etc.)
 * @param {number} column - Column number (1-indexed)
 * @returns {string} - Column letter(s)
 */
function columnToLetter(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}
