import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

const landing = await readFile(path.join(appRoot, 'landingpage.html'), 'utf8');
const privacy = await readFile(path.join(appRoot, 'privacy.html'), 'utf8');
const impressum = await readFile(path.join(appRoot, 'impressum.html'), 'utf8');

assert.ok(
  landing.includes("Vera's Pokémon TCG Tracker") || landing.includes("Vera's Pokemon TCG Tracker"),
  'Die lokale Landingpage soll echten Projektinhalt statt nur einer Weiterleitung enthalten.'
);

assert.ok(
  privacy.includes('Datenschutz & Nutzung von Google-Daten'),
  'Die lokale Datenschutzseite soll den echten Datenschutztext enthalten.'
);

assert.ok(
  impressum.includes('Kontakt & rechtliche Hinweise'),
  'Die lokale Impressum-/Kontaktseite soll den echten Hinweistex enthalten.'
);

assert.ok(
  privacy.includes('veraatversus+tcg@gmail.com') && impressum.includes('veraatversus+tcg@gmail.com'),
  'Die lokalen Legal-Seiten sollen die aktuelle Kontaktmail anzeigen.'
);

assert.ok(
  !landing.includes('window.location.replace(finalTarget)') &&
    !privacy.includes('window.location.replace(finalTarget)') &&
    !impressum.includes('window.location.replace(finalTarget)'),
  'Die lokalen Legal-Seiten sollen zur Laufzeit nicht sofort auf eine externe URL umleiten.'
);

console.log('✅ legal pages runtime content regression ok');
