export const CONFIG = {
  // Google API Configuration
  // TODO: Replace with your actual credentials from Google Cloud Console
  CLIENT_ID: '1076184415163-bq3vk7p22m709m9u9bs4rhs76sjiddsl.apps.googleusercontent.com',
  API_KEY: 'YOUR_API_KEY', // Optional for public sheets
  DISCOVERY_DOCS: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets',

  // Google Sheets Configuration
  // TODO: Replace with your actual Spreadsheet ID
  SPREADSHEET_ID: '1RepZ5n-45tou-9vu20l8ffErT4TfBaLDdyY8BwxQDsI',
  
  // Sheet Names (adjust if your sheets have different names)
  SHEETS: {
    OVERVIEW: 'Sets Overview',
    SUMMARY: 'Collection Summary'
  },

  // Layout Configuration (from try1/try2)
  CARDS_PER_ROW: 5,
  CARD_BLOCK_WIDTH: 3,
  CARD_BLOCK_HEIGHT: 4,

  // API Configuration
  POKEMONTCG_API: 'https://api.pokemontcg.io/v2/',
  TCGDEX_API: 'https://api.tcgdex.net/v2/de/',
  VERA_API: 'https://veraatversus.github.io/pokemon-tcg-data/',

  // Cache Duration (1 hour)
  CACHE_DURATION: 60 * 60 * 1000
};
