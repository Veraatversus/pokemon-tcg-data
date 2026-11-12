// In-Memory-Spreadsheet als gapi.client.sheets-Stub fuer sheets-db.js-Tests.
// Unterstuetzt values.get/update/batchUpdate/clear und spreadsheets.get/batchUpdate (addSheet, appendDimension).

function colToIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function parseRange(range) {
  const text = String(range);
  const bang = text.lastIndexOf('!');
  let sheet = text.slice(0, bang);
  if (sheet.startsWith("'") && sheet.endsWith("'")) sheet = sheet.slice(1, -1).replace(/''/g, "'");
  const a1 = text.slice(bang + 1);
  const [start, end = start] = a1.split(':');
  const parse = (part) => {
    const m = /^([A-Z]+)(\d*)$/i.exec(part);
    return { col: colToIndex(m[1]), row: m[2] ? Number(m[2]) - 1 : null };
  };
  const s = parse(start);
  const e = parse(end);
  return { sheet, c1: s.col, r1: s.row ?? 0, c2: e.col, r2: e.row ?? Number.POSITIVE_INFINITY };
}

export function createFakeSpreadsheet(initial = {}, { readDelayMs = {} } = {}) {
  const sheets = new Map(Object.entries(initial).map(([title, rows]) => [title, rows.map((r) => [...r])]));
  const writes = []; // { sheet, range, values }
  const reads = [];

  const ensureSheet = (title) => {
    if (!sheets.has(title)) throw Object.assign(new Error(`Unable to parse range: ${title}`), { status: 400 });
    return sheets.get(title);
  };

  function get({ range }) {
    reads.push(range);
    const { sheet, c1, r1, c2, r2 } = parseRange(range);
    const grid = ensureSheet(sheet);
    const out = [];
    for (let r = r1; r < Math.min(grid.length, r2 + 1); r += 1) {
      const row = (grid[r] || []).slice(c1, c2 + 1);
      while (row.length && (row[row.length - 1] === '' || row[row.length - 1] == null)) row.pop();
      out.push(row);
    }
    while (out.length && out[out.length - 1].length === 0) out.pop();
    return { result: { values: out } };
  }

  function write(range, values) {
    const { sheet, c1, r1 } = parseRange(range);
    const grid = ensureSheet(sheet);
    writes.push({ sheet, range, values });
    values.forEach((rowValues, dr) => {
      const r = r1 + dr;
      while (grid.length <= r) grid.push([]);
      rowValues.forEach((v, dc) => {
        const c = c1 + dc;
        while (grid[r].length <= c) grid[r].push('');
        grid[r][c] = v;
      });
    });
  }

  const api = {
    spreadsheets: {
      get: async () => ({
        result: {
          sheets: [...sheets.keys()].map((title, i) => ({
            properties: { sheetId: i + 1, title, gridProperties: { rowCount: 100000, columnCount: 60 } }
          }))
        }
      }),
      batchUpdate: async ({ resource }) => {
        for (const req of resource?.requests || []) {
          if (req.addSheet) sheets.set(req.addSheet.properties.title, []);
        }
        return { result: {} };
      },
      values: {
        get: async (args) => {
          const ms = readDelayMs[parseRange(args.range).sheet];
          if (ms) await new Promise((resolve) => setTimeout(resolve, ms));
          return get(args);
        },
        update: async ({ range, resource }) => { write(range, resource.values); return { result: {} }; },
        batchUpdate: async ({ resource }) => {
          for (const entry of resource.data) write(entry.range, entry.values);
          return { result: {} };
        },
        clear: async ({ range }) => {
          const { sheet, c1, r1, c2, r2 } = parseRange(range);
          const grid = ensureSheet(sheet);
          writes.push({ sheet, range, values: null, clear: true });
          for (let r = r1; r < Math.min(grid.length, r2 + 1); r += 1) {
            for (let c = c1; c <= Math.min(c2, (grid[r] || []).length - 1); c += 1) grid[r][c] = '';
          }
          return { result: {} };
        }
      }
    }
  };

  return {
    gapi: { client: { sheets: api } },
    sheets,
    writes,
    reads,
    rows: (title) => sheets.get(title),
    writesTo: (title) => writes.filter((w) => w.sheet === title)
  };
}
