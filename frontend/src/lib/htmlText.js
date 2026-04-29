// Lightweight helpers for the HTML strings we receive from the source CMS in
// edusperience descriptions. We intentionally do NOT use a full HTML renderer
// (react-native-render-html etc.) because the descriptions are short prose
// with at most paragraphs, line breaks, simple inline marks, and the
// occasional inline style. A pure-JS, dependency-free pass is plenty.

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201d',
  ldquo: '\u201c',
};

function decodeEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name)
        ? NAMED_ENTITIES[name]
        : m
    );
}

// Strip all tags, decode entities, normalise whitespace. Preserves logical
// breaks between paragraphs/lines so previews don't run together.
//   "<p>hi</p><p>there</p>" -> "hi\n\nthere"
//   "a<br>b"                -> "a\nb"
export function stripHtml(html) {
  if (!html) return '';
  let s = String(html);
  s = s.replace(/<\s*br\s*\/?\s*>/gi, '\n');
  s = s.replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n\n');
  s = s.replace(/<li\b[^>]*>/gi, '\u2022 ');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

// One-line preview for cards: collapse all whitespace to single spaces.
export function previewText(html, maxLen = 220) {
  const plain = stripHtml(html).replace(/\s+/g, ' ').trim();
  if (plain.length <= maxLen) return plain;
  return plain.slice(0, maxLen - 1).trimEnd() + '\u2026';
}

// Split HTML into "blocks" suitable for rendering as a stack of <Text>
// components. Each block is just a paragraph's plain text (entities decoded,
// inner tags stripped). Empty blocks are dropped.
//
// Good enough for the source-panel rendered view: paragraphs render as
// separate lines with normal spacing; tags like <span style="..."> are
// flattened to their inner text (no inline color rendering).
export function parseHtmlBlocks(html) {
  if (!html) return [];
  const text = String(html)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '\u2022 ');
  const stripped = text.replace(/<[^>]+>/g, '');
  return decodeEntities(stripped)
    .split(/\n{2,}/)
    .map((b) => b.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}
