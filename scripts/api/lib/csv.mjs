// RFC-4180-Parser: Quotes, escaped Quotes (""), \r\n und \n. Fuehrendes BOM wird entfernt, Leerzeilen ergeben [''].
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // UTF-8-BOM
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let pending = false; // aktuelle Zeile hat Inhalt (auch ein leeres Feld nach Komma)
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') { quoted = true; pending = true; }
    else if (ch === ',') { row.push(field); field = ''; pending = true; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = ''; pending = false;
    } else { field += ch; pending = true; }
  }
  if (pending || field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
