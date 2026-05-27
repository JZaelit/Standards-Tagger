// Pick a short, alignment-specific excerpt from objective text for the
// "Where in the lesson" panel. Uses stored source_excerpt when present;
// otherwise scores sentences/clauses against rationale + standard text.

import { stripHtml } from './htmlText';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'shall', 'can', 'this', 'that', 'these', 'those', 'it',
  'its', 'they', 'them', 'their', 'we', 'our', 'you', 'your', 'which', 'who',
  'what', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'also', 'demonstrates', 'ability',
  'standard', 'objective', 'student', 'students', 'work', 'writing', 'meet',
  'meeting', 'providing', 'creating', 'clear', 'coherent', 'aligns', 'align',
  'aligning', 'basic', 'element', 'elements', 'suitable', 'reasonable', 'fit',
]);

function extractKeywords(...texts) {
  const words = texts
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
  return [...new Set(words)];
}

function splitIntoChunks(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sentences = trimmed
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
  if (sentences.length > 1) return sentences;

  const clauses = trimmed
    .split(/\s+(?:and|or)\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
  if (clauses.length > 1) return clauses;

  const commaParts = trimmed
    .split(/[,;]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
  if (commaParts.length > 1) return commaParts;

  return [trimmed];
}

function scoreChunk(chunk, keywords, alignment) {
  const lower = chunk.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) score += kw.length;
  }

  const rationale = (alignment?.rationale || '').toLowerCase();
  const nums = rationale.match(/\d+[-–]\d+|\d+/g) || [];
  for (const n of nums) {
    if (lower.includes(n)) score += 24;
  }

  const quoted = rationale.match(/"([^"]+)"/g) || [];
  for (const q of quoted) {
    const inner = q.replace(/"/g, '').toLowerCase();
    if (inner.length > 4 && lower.includes(inner)) score += 32;
  }

  const wordNums = ['five', 'four', 'three', 'two', 'one', 'ten', 'paragraph', 'paragraphs'];
  for (const w of wordNums) {
    if (rationale.includes(w) && lower.includes(w)) score += 18;
  }

  return score;
}

function extractSubstring(text, alignment) {
  const rationale = (alignment?.rationale || '').toLowerCase();
  const lowerText = text.toLowerCase();

  const nums = (alignment?.rationale || '').match(/\d+[-–]\d+|\d+/g) || [];
  for (const n of nums) {
    const idx = text.indexOf(n);
    if (idx === -1) continue;
    const start = Math.max(
      0,
      text.lastIndexOf(',', idx) + 1,
      text.lastIndexOf(';', idx) + 1,
      text.toLowerCase().lastIndexOf(' and ', idx) + 5,
    );
    const candidates = [
      text.indexOf(',', idx),
      text.indexOf(';', idx),
      lowerText.indexOf(' and ', idx),
    ].filter((i) => i > idx);
    const end = candidates.length ? Math.min(...candidates) : text.length;
    const slice = text.slice(start, end).trim().replace(/^[,;\s]+/, '');
    if (slice.length > 6) return slice;
  }

  const phrases = [
    'five paragraphs',
    'five-paragraph',
    'paragraph structure',
    '500-1000 words',
    'word count',
  ];
  for (const phrase of phrases) {
    if (!rationale.includes(phrase.replace('-', '')) && !rationale.includes(phrase)) {
      continue;
    }
    const idx = lowerText.indexOf(phrase.replace('-', ' '));
    if (idx === -1) continue;
    const re = new RegExp(`[^,.;]*${phrase.replace('-', '[- ]?')}[^,.;]*`, 'i');
    const m = text.match(re);
    if (m) return m[0].trim();
  }

  return null;
}

function pickBestChunk(chunks, alignment, reserved = new Set()) {
  const keywords = extractKeywords(
    alignment?.rationale || '',
    alignment?.text || '',
    alignment?.code || '',
  );
  let best = chunks[0] || '';
  let bestScore = -1;
  for (const chunk of chunks) {
    let score = scoreChunk(chunk, keywords, alignment);
    if (reserved.has(chunk.trim().toLowerCase())) score -= 40;
    if (score > bestScore) {
      bestScore = score;
      best = chunk;
    }
  }
  return (best || '').trim();
}

export function sourceExcerptForAlignment(objectiveText, alignment, siblingAlignments = []) {
  if (alignment?.source_excerpt) {
    return alignment.source_excerpt.trim();
  }

  const text = stripHtml(objectiveText || '');
  if (!text) return '';

  const chunks = splitIntoChunks(text);
  if (chunks.length === 1) {
    return extractSubstring(text, alignment) || text.trim();
  }

  const reserved = new Set();
  for (const sib of siblingAlignments) {
    if (sib === alignment) continue;
    if (sib?.source_excerpt) {
      reserved.add(sib.source_excerpt.trim().toLowerCase());
      continue;
    }
    const picked = pickBestChunk(chunks, sib);
    if (picked) reserved.add(picked.toLowerCase());
  }

  return pickBestChunk(chunks, alignment, reserved);
}
