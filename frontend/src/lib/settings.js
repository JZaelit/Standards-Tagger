// User settings stored in per-user localStorage (see storage.js).
// Keys are trimmed only — never rewritten or "fixed" (that corrupts valid keys).

import { storage } from './storage';

const KEY_GEMINI_API = 'settings:gemini_api_key';
const KEY_GEMINI_PROXY = 'settings:gemini_proxy_url';

export function getGeminiApiKey() {
  const v = storage.get(KEY_GEMINI_API, '');
  return typeof v === 'string' ? v.trim() : '';
}

export function setGeminiApiKey(key) {
  const trimmed = (key || '').trim();
  if (!trimmed) {
    storage.remove(KEY_GEMINI_API);
    return;
  }
  storage.set(KEY_GEMINI_API, trimmed);
}

export function getGeminiProxyUrl() {
  const v = storage.get(KEY_GEMINI_PROXY, '');
  return typeof v === 'string' ? v.trim().replace(/\/$/, '') : '';
}

export function setGeminiProxyUrl(url) {
  const trimmed = (url || '').trim().replace(/\/$/, '');
  if (!trimmed) {
    storage.remove(KEY_GEMINI_PROXY);
    return;
  }
  storage.set(KEY_GEMINI_PROXY, trimmed);
}

export function clearGeminiApiKey() {
  storage.remove(KEY_GEMINI_API);
}

export function hasGeminiApiKey() {
  return getGeminiApiKey().length > 0;
}

export function hasGeminiConfigured() {
  return hasGeminiApiKey();
}

/** @deprecated use trim on input directly */
export function sanitizeGeminiApiKey(raw) {
  return (raw || '').trim();
}

/** Minimal format check — does not rewrite the key. */
export function describeGeminiApiKey(key) {
  const k = (key || '').trim();
  if (!k) return { ok: false, message: 'No key entered.' };
  if (!k.startsWith('AIza')) {
    return {
      ok: false,
      message: 'Key should start with AIza (from Google AI Studio).',
    };
  }
  return {
    ok: true,
    length: k.length,
    suffix: k.slice(-4),
    message: `Key saved (${k.length} chars, ends …${k.slice(-4)}).`,
  };
}

export function maskGeminiApiKey(key = getGeminiApiKey()) {
  if (!key) return '';
  if (key.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(12, key.length - 4))}${key.slice(-4)}`;
}

/** Safe fingerprint for comparing with source (never logs full key). */
export function fingerprintGeminiApiKey(key = getGeminiApiKey()) {
  const k = (key || '').trim();
  if (!k) return null;
  const c1 = k[1] || '';
  const pos2 =
    c1 === 'I' ? 'I (capital i)' : c1 === 'l' ? 'l (lowercase L — wrong!)' : c1;
  return {
    length: k.length,
    prefix: k.slice(0, 4),
    pos2,
    suffix: k.slice(-4),
  };
}

/** Parse GEMINI_API_KEY= from .env text — exact value, no rewriting. */
export function parseGeminiKeyFromEnvText(text) {
  if (!text) return '';
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^GEMINI_API_KEY\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[1].trim();
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    return val.trim();
  }
  return '';
}
