#!/usr/bin/env node
/**
 * @fileoverview Generates a custom-set `.mjs` file (matching the 5241.mjs shape)
 * from one or more Cardmarket search-result HTML pages.
 *
 * ============================================================================
 * ## How to use
 * ============================================================================
 *
 * 1. Save the Cardmarket HTML pages
 *    ------------------------------
 *    Open a Cardmarket search results page in your browser, e.g.
 *      https://www.cardmarket.com/en/Pokemon/Products/Singles/Skyridge
 *        ?idRarity=0&sortBy=collectorsnumber_asc&perSite=100&site=1
 *    or
 *      https://www.cardmarket.com/de/Pokemon/Products/Search
 *        ?searchMode=v2&idCategory=0&idExpansion=1538&idRarity=0
 *        &sortBy=collectorsnumber_asc&perSite=100&site=1
 *    
 * View Page Source (Ctrl+U / Cmd+Opt+U) and save the HTML into
 *      scripts/cardmarket/custom-sets/inputs/<set-slug>-page-N.html
 *    For multi-page results, save each page separately
 *      (-page-1.html, -page-2.html, ...). The order you pass them on
 *      the command line determines the order of the `// --- Page N ---`
 *      comments in the output.
 *
 * 2. Run the script
 *    --------------
 *    Usually you only need to pass the HTML file(s) — everything else is
 *    auto-detected:
 *
 *      node scripts/cardmarket/custom-sets/generate-custom-set.mjs \
 *          scripts/cardmarket/custom-sets/inputs/skyridge-page-1.html \
 *          scripts/cardmarket/custom-sets/inputs/skyridge-page-2.html
 *
 *    The script reads:
 *      - --set-name     from the page <title> ("Skyridge Singles | Cardmarket" → "Skyridge")
 *      - --set-id       from `idExpansion=1538&…` in the HTML modal URLs
 *      - --locale       from the <link rel="canonical"> locale segment
 *      - --set-slug     from the <link rel="canonical"> slug segment
 *      - --output       defaults to <set-id>.mjs next to this script
 *
 *    The const name is auto-derived as <SET_NAME>_<SET_ID>, uppercased
 *    with non-alphanumerics replaced by `_` (e.g. "Skyridge" + "1538" →
 *    SKYRIDGE_1538). Override any of these via the matching CLI flag.
 *    See `node … --help` for the full list.
 *
 * 3. Verify the output
 *    ----------------
 *    Spot-check the new .mjs against the source HTML: open the HTML, pick
 *    a product ID, confirm the collector number matches. The script reads:
 *      - productId        from the data-echo image URL
 *      - collectorNumber  from the <h2> title parens, e.g. (SK 146), (SK H1)
 *      - name + version   from the href slug, e.g. .../Charizard-V2-SK146
 *                         → name="Charizard", version="V2"
 *
 *    Rules applied to the collector number:
 *      - The displayed CN from the title is the source of truth (e.g. "150"
 *        from "(SK 150)" or "H1" from "(SK H1)").
 *      - For each (name, CN) group with multiple V versions, the smallest V
 *        (or no V) keeps the base CN; higher V versions get a "V{n}" suffix
 *        (so Charizard V1-SK146 → "146" and Charizard V2-SK146 → "146V2").
 *      - Holo variants keep their H prefix in the CN, so they sort after
 *        the numbered cards (1, 2, …, 150, H1, H2, …, H32).
 *
 * ============================================================================
 * ## Examples
 * ============================================================================
 *
 *   # Minimal — everything is auto-detected from the HTML:
 *   node generate-custom-set.mjs inputs/skyridge-page-1.html inputs/skyridge-page-2.html
 *
 *   # Skyridge (1538) — V1/V2 versions + H-prefixed holos, override output:
 *   node generate-custom-set.mjs inputs/skyridge-page-1.html inputs/skyridge-page-2.html \
 *       --output ../1538.mjs
 *
 *   # SV Black Star Promos (5241) — V1/V2/V3 on regular cards:
 *   node generate-custom-set.mjs inputs/svp-page-1.html inputs/svp-page-2.html \
 *       inputs/svp-page-3.html inputs/svp-page-4.html
 *
 * ============================================================================
 * ## Options
 * ============================================================================
 *
 *   --set-name=NAME        Human-readable set name (default: from <title>)
 *   --set-id=ID            Numeric set id (default: from idExpansion in HTML)
 *   --set-slug=SLUG        URL slug override (default: from <link rel=canonical>)
 *   --locale=xx            URL locale override (default: from <link rel=canonical>)
 *   --const-name=NAME      Const name override (default: <SET_NAME>_<SET_ID>)
 *   -h, --help             Show this help
 */

import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const HELP = `Usage: node generate-custom-set.mjs <html-file> [<html-file>...] [options]

All three of --set-name, --set-id and --output are auto-detected from the
HTML / filenames if not given. See the JSDoc at the top of the script for
the full how-to.

Options:
  --set-name=NAME        Human-readable set name (default: from <title>)
  --set-id=ID            Numeric set id (default: from idExpansion in HTML)
  --set-slug=SLUG        URL slug override (default: from <link rel=canonical>)
  --locale=xx            URL locale override (default: from <link rel=canonical>)
  --const-name=NAME      Const name override (default: <SET_NAME>_<SET_ID>)
  --output=FILE          Output file (default: <set-id>.mjs next to this script)
  -h, --help             Show this help
`;

const { values, positionals } = parseArgs({
  options: {
    "set-name": { type: "string" },
    "set-id": { type: "string" },
    "set-slug": { type: "string" },
    locale: { type: "string" },
    "const-name": { type: "string" },
    output: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(HELP);
  process.exit(0);
}
if (positionals.length === 0) {
  console.error(HELP);
  process.exit(1);
}

// All three (--set-name, --set-id, --output) are auto-detected if not given.
// The values can come from: explicit CLI arg, the HTML <title> and idExpansion
// markers, or a default derived from set-id. See `resolveSetMeta()` below.

// ---------- HTML extraction ----------

/**
 * Auto-detect locale and URL slug from the page's canonical link, which is
 * the only unambiguous identifier in the HTML. The early `<a href="/xx/...">`
 * matches are language-selector dropdowns, not the gallery, so we skip them.
 */
function autoDetect(html) {
  const m = html.match(
    /<link\s+rel="canonical"\s+href="https?:\/\/[^"]+\/(\w+)\/Pokemon\/Products\/Singles\/([^"/]+)/
  );
  if (!m) return null;
  return { locale: m[1], slug: m[2] };
}

/**
 * Auto-detect the Cardmarket set id (numeric) from the HTML. Two reliable
 * markers appear on every search-results page:
 *   - idExpansion=1538&...
 *       in modal/data-* URLs (preferred — unambiguous, just the set id)
 *   - <option value="1538" selected="selected">Skyridge</option>
 *       in the expansion-selector dropdown (used as fallback, since the
 *       dropdown also contains a "Singles" option with id 51)
 */
function autoDetectSetId(html) {
  const fromUrl = html.match(/[?&]idExpansion=(\d+)/);
  if (fromUrl) return fromUrl[1];
  // Pick the largest numeric value among selected options — expansion ids
  // are 4+ digits while category ids (Singles=51, Sealed=…) are 1–2 digits.
  const selected = [...html.matchAll(/<option\s+value="(\d+)"[^>]*\bselected="selected"/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => n >= 1000);
  if (selected.length > 0) return String(Math.max(...selected));
  return null;
}

/**
 * Auto-detect the human-readable set name from the page <title>. Cardmarket
 * uses titles like "Skyridge Singles | Cardmarket" — strip the "Singles |
 * Cardmarket" suffix to get the bare set name.
 */
function autoDetectSetName(html) {
  const m = html.match(/<title>([^<]+?)\s+Singles?\s*\|[^<]*<\/title>/i);
  return m ? m[1].trim() : null;
}

/**
 * Parse a single gallery card block and return its raw attributes.
 * Returns { productId, name, version, collectorNumber, versionRaw }
 *   - productId: numeric
 *   - name: card name (e.g. "Alakazam" or "Buried-Fossil")
 *   - version: "V1"/"V2"/... or null
 *   - collectorNumber: the displayed number from the h2 title
 *                       (e.g. "1", "146", "H1" for holo variants, "4" for SVP 004)
 *   - versionRaw: "V1"/"V2"/... or null (kept alongside version for clarity)
 */
function parseBlock(block) {
  // productId from data-echo image URL
  const imgMatch = block.match(
    /data-echo="https:\/\/product-images\.s3\.cardmarket\.com\/\d+\/\w+\/(\d+)\/\d+\.(?:jpg|png)"/i
  );
  if (!imgMatch) return null;
  const productId = Number(imgMatch[1]);

  // href -> name + version. Path looks like "Name-SK1" or "Name-V2-SK2" or "Name-V1-SKH1"
  const hrefMatch = block.match(
    /href="\/[^"]*\/Products\/Singles\/[^"]+\/([^"]+)"/i
  );
  if (!hrefMatch) return null;
  const lastSegment = hrefMatch[1]; // e.g. "Alakazam-V2-SK2", "Buried-Fossil-SK47"

  // Match: <name>[-V<digits>]-<setcode><digits>[<letter-suffix>]
  // setcode is one or more uppercase letters (SK, SKH, SVP, AQ, PAL, ...)
  // The optional trailing letter handles special variants like "AQ50a", "AQ50b".
  // The regex is non-greedy on the name so multi-word names like
  // "Buried-Fossil" or "Ancient-Ruins" stay intact.
  const hrefM = lastSegment.match(/^(.+?)(?:-V(\d+))?(-[A-Z]+)(\d+)([a-z]?)$/);
  if (!hrefM) return null;
  const name = hrefM[1];
  const version = hrefM[2] ? `V${hrefM[2]}` : null;

  // collector number from h2 title. The title contains a parenthesised token
  // like "(SK 1)", "(SK H1)", "(SVP 001)", "(SVPen001)", "(AQ 50a)".
  const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<\/h2>/i);
  if (!titleMatch) return null;

  // Extract the parenthesised token, strip leading/trailing whitespace and
  // any trailing setcode prefix, then strip leading zeros. The result keeps
  // an optional letter prefix (so "H1" stays "H1", "1" stays "1") and an
  // optional trailing letter for variants like "50a", "50b".
  const parenMatch = titleMatch[0].match(
    /\(([A-Z]+(?:en)?[ ]?[A-Z]?\s*\d+[a-z]?)\)/i
  );
  if (!parenMatch) return null;
  const token = parenMatch[1].trim(); // e.g. "SK 1", "SK H1", "SVP 001", "AQ 50a"
  // Strip everything up to the first digit, then strip leading zeros.
  // "SK 1" -> " 1" -> "1" ; "SK H1" -> " H1" -> "H1" ; "AQ 50a" -> " 50a" -> "50a"
  const collectorNumber = token.replace(/^[A-Z]+(?:en)?\s*/, "").replace(/^0+/, "") || "0";

  return { productId, name, version, collectorNumber };
}

/**
 * Extract card entries from one HTML response.
 * Returns an array of { productId, name, version, collectorNumber } objects.
 */
function extractCards(html) {
  const blocks =
    html.match(
      /<a\s+href="[^"]*"\s+class="card text-center w-100 galleryBox">[\s\S]*?<\/a>\s*<\/div>/g
    ) || [];

  const cards = [];
  const seen = new Set();

  for (const block of blocks) {
    const parsed = parseBlock(block);
    if (!parsed) continue;
    if (seen.has(parsed.productId)) continue;
    seen.add(parsed.productId);
    cards.push(parsed);
  }

  return cards;
}

// ---------- Grouping + V-suffix assignment ----------

/**
 * Group cards by (name, collectorNumber) and assign V-suffixes within each group.
 *
 *   - Groups with size == 1: keep the base collector number
 *   - Groups with size  > 1: sort by V version (null < V1 < V2 < ...), the first
 *     card keeps the base collector number, the others get `<cn>V{n}`
 *
 * Returns a flat array of { productId, collectorNumber, version, name } sorted
 * by collector number (natural sort).
 */
function groupAndAssign(cards) {
  const groups = new Map();
  for (const card of cards) {
    const key = `${card.name}::${card.collectorNumber}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }

  const result = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      const c = group[0];
      result.push({
        productId: c.productId,
        name: c.name,
        collectorNumber: c.collectorNumber,
        version: c.version,
      });
      continue;
    }

    // Multi-card group: sort by V version, null first
    group.sort((a, b) => {
      const av = a.version ? parseInt(a.version.slice(1)) : 0;
      const bv = b.version ? parseInt(b.version.slice(1)) : 0;
      return av - bv;
    });

    group.forEach((c, i) => {
      const isStandard = i === 0;
      const cn = isStandard
        ? c.collectorNumber
        : `${c.collectorNumber}${c.version}`;
      result.push({
        productId: c.productId,
        name: c.name,
        collectorNumber: cn,
        version: c.version,
      });
    });
  }

  return result;
}

/**
 * Natural sort: puts numbered cards first, then H-prefixed, then specials.
 * e.g. "1", "2", …, "150", "H1", "H2", …, "H32"
 */
function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function sortResult(cards) {
  return [...cards].sort((a, b) => {
    return naturalCompare(a.collectorNumber, b.collectorNumber);
  });
}

// ---------- MJS output formatting ----------

/**
 * Format the final MJS output: JSDoc header, const array (with page comments),
 * and transformSet() function. Shape matches 5241.mjs.
 */
function formatMjs({ constName, setName, setSlug, setId, pages }) {
  const lines = [];

  // Header JSDoc
  lines.push("/**");
  lines.push(` * ${setName} (Set ${setId})`);
  lines.push(" *");
  lines.push(
    " * Card order and collector numbers sourced from Cardmarket search results"
  );
  lines.push(" * sorted by collector number ascending.");
  lines.push(" *");
  lines.push(" * Each entry: { productId, collectorNumber }");
  lines.push(" * - productId: Cardmarket product ID extracted from image URLs");
  lines.push(
    " * - collectorNumber: The set's collector number, parsed from the card title"
  );
  lines.push(" *   - Standard version (smallest V in href): just the number (e.g. \"4\")");
  lines.push(" *   - Higher versions: number + version suffix (e.g. \"4V2\")");
  lines.push(" */");
  lines.push("");

  // Const array
  lines.push(`const ${constName} = [`);

  pages.forEach((pageCards, pageIdx) => {
    if (pageCards.length === 0) return;
    const first = pageCards[0].collectorNumber;
    const last = pageCards[pageCards.length - 1].collectorNumber;
    lines.push(`  // --- Page ${pageIdx + 1} (${first}–${last}) ---`);
    for (const c of pageCards) {
      lines.push(
        `  { productId: ${c.productId}, collectorNumber: "${c.collectorNumber}" },`
      );
    }
    lines.push("");
  });

  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  lines.push("];");
  lines.push("");

  // transformSet function (shape mirrors 5241.mjs)
  lines.push("/**");
  lines.push(
    ` * Transforms the set payload by reordering cards and assigning collector numbers`
  );
  lines.push(
    ` * based on the Cardmarket search results for ${setName} (${setId}).`
  );
  lines.push(" */");
  lines.push(
    `export function transformSet(payload, { logger = console } = {}) {`
  );
  lines.push("  if (!payload || !Array.isArray(payload.cards)) {");
  lines.push("    return payload;");
  lines.push("  }");
  lines.push("");
  lines.push("  const cardMap = new Map();");
  lines.push(`  for (const card of ${constName}) {`);
  lines.push(
    "    cardMap.set(String(card.productId), card.collectorNumber);"
  );
  lines.push("  }");
  lines.push("");
  lines.push("  const reordered = [];");
  lines.push("  const missing = [];");
  lines.push("");
  lines.push("  for (const [productId, collectorNumber] of cardMap) {");
  lines.push("    const found = payload.cards.find(");
  lines.push(
    "      (c) => String(c?.cardmarketProductId) === productId"
  );
  lines.push("    );");
  lines.push("    if (found) {");
  lines.push("      reordered.push({ ...found, collectorNumber });");
  lines.push("    } else {");
  lines.push("      missing.push(productId);");
  lines.push("    }");
  lines.push("  }");
  lines.push("");
  lines.push("  if (missing.length > 0) {");
  lines.push(
    `    logger.warn(\`[cardmarket-custom-sets/${setId}] \${missing.length} card(s) not found in payload: \${missing.join(", ")}\`);`
  );
  lines.push("  }");
  lines.push("");
  lines.push("  return {");
  lines.push("    ...payload,");
  lines.push("    cards: reordered,");
  lines.push("  };");
  lines.push("}");

  return lines.join("\n") + "\n";
}

// ---------- main ----------

const htmlFiles = positionals;
const pages = [];
let detectedLocale = null;
let detectedSlug = null;
let detectedSetId = values["set-id"] || null;
let detectedSetName = values["set-name"] || null;
let totalRaw = 0;
let totalKept = 0;
const seenProductIds = new Set();

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf-8");

  if (!detectedLocale || !detectedSlug) {
    const det = autoDetect(html);
    if (det) {
      detectedLocale = det.locale;
      detectedSlug = det.slug;
    }
  }

  // set-id and set-name live in the HTML (see autoDetectSetId / autoDetectSetName
  // for the markers we look for). The first HTML that yields a value wins.
  if (!detectedSetId) {
    detectedSetId = autoDetectSetId(html);
  }
  if (!detectedSetName) {
    detectedSetName = autoDetectSetName(html);
  }

  const raw = extractCards(html);
  totalRaw += raw.length;

  // Dedup across pages (same productId on multiple pages is rare but possible)
  const deduped = raw.filter((c) => {
    if (seenProductIds.has(c.productId)) return false;
    seenProductIds.add(c.productId);
    return true;
  });

  const grouped = groupAndAssign(deduped);
  const sorted = sortResult(grouped);
  pages.push(sorted);
  totalKept += sorted.length;
}

if (!detectedSetId) {
  console.error(
    "Error: could not determine set id. Pass --set-id=ID or rename an input file to '<slug>-<id>-page-N.html'."
  );
  process.exit(1);
}
if (!detectedSetName) {
  console.error(
    "Error: could not determine set name. Pass --set-name=NAME explicitly."
  );
  process.exit(1);
}

const SET_ID = detectedSetId;
const SET_NAME = detectedSetName;
const locale = values.locale || detectedLocale || "en";
const slug = values["set-slug"] || detectedSlug || "";
const constName =
  values["const-name"] ||
  `${SET_NAME.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase()}_${SET_ID}`;

// Default output: drop the .mjs next to this script, named <set-id>.mjs
// (e.g. scripts/cardmarket/custom-sets/1538.mjs). Override with --output.
const scriptDir = new URL(".", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const defaultOutput = `${scriptDir}${SET_ID}.mjs`;

const mjs = formatMjs({
  constName,
  setName: SET_NAME,
  setSlug: slug,
  setId: SET_ID,
  pages,
});

if (values.output) {
  writeFileSync(values.output, mjs, "utf-8");
  console.error(
    `Wrote ${values.output} (${totalKept} cards across ${pages.length} page(s); locale=${locale}, slug=${slug})`
  );
} else {
  writeFileSync(defaultOutput, mjs, "utf-8");
  console.error(
    `Wrote ${defaultOutput} (${totalKept} cards across ${pages.length} page(s); locale=${locale}, slug=${slug})`
  );
}

console.error(
  `\nSet:    ${SET_NAME} (${SET_ID})\nLocale: ${locale}\nSlug:   ${slug}\nConst:  ${constName}\nTotal raw: ${totalRaw}\nTotal kept (after dedup): ${totalKept}\nPages: ${pages.length}`
);
