import fs from 'node:fs';

const file = 'frontend/tcg-tracker-web/js/data/cardmarket-ui-helpers.js';
let content = fs.readFileSync(file, 'utf8');

// Replace the condition: remove "&& highestDirectCount < 2"
const oldLine = "  if (trackerSetIndex && typeof trackerSetIndex === 'object' && highestDirectCount < 2) {";
const newLine = "  // Always consult the tracker index — more reliable than stale DB URLs\n  if (trackerSetIndex && typeof trackerSetIndex === 'object') {";

if (content.includes(oldLine)) {
  content = content.replace(oldLine, newLine);
  fs.writeFileSync(file, content);
  console.log('Fix applied successfully');
} else {
  console.log('Pattern not found!');
  // Show lines around the trackerSetIndex condition
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('trackerSetIndex') && line.includes('highestDirectCount')) {
      console.log(`Line ${i + 1}: ${line}`);
    }
  });
}
