import { CONFIG } from '../config/config.js';

/**
 * Read data from Google Sheets
 * @param {string} range - A1 notation range (e.g., "Sets Overview!A1:Z100")
 * @returns {Promise<Array>} - 2D array of cell values
 */
export async function readSheet(range) {
  try {
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: range,
    });
    return response.result.values || [];
  } catch (error) {
    console.error('Error reading sheet:', error);
    throw error;
  }
}

/**
 * Write data to Google Sheets
 * @param {string} range - A1 notation range
 * @param {Array} values - 2D array of values to write
 */
export async function writeSheet(range, values) {
  try {
    const response = await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: range,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: values,
      },
    });
    return response.result;
  } catch (error) {
    console.error('Error writing to sheet:', error);
    throw error;
  }
}

/**
 * Batch read multiple ranges
 * @param {Array<string>} ranges - Array of A1 notation ranges
 * @returns {Promise<Array>} - Array of value ranges
 */
export async function batchReadSheet(ranges) {
  try {
    const response = await gapi.client.sheets.spreadsheets.values.batchGet({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      ranges: ranges,
    });
    return response.result.valueRanges;
  } catch (error) {
    console.error('Error batch reading:', error);
    throw error;
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
