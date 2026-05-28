// Local JSON parsing for EduSperience and standards uploads.
// JSON is parsed in-browser (no Gemini). PDF/DOCX still use Gemini.

import { previewText } from './htmlText';
import { normalizeParsedEdusperience, parseEdusperienceDocument, parseStandardsDocument } from './gemini';
import { dataClient } from './dataClient';
import {
  readPickerAssetAsBase64,
  readPickerAssetAsText,
  readStoredFileAsText,
  storeFile,
  isJsonUpload,
  getFile,
} from './fileStore';
import { hasGeminiConfigured } from './settings';

export { isJsonUpload };

export function parseEdusperienceJson(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid EduSperience JSON.');
  }

  const sections = (data.sections || []).map((sec) => ({
    title: sec.title || sec.name || 'Section',
    objectives: (sec.objectives || [])
      .map((obj) => {
        const desc = previewText(obj.description || obj.title || '');
        return {
          description: desc,
          label: obj.title || '',
          evaluation_type: obj.evaluation_type || null,
          audience: obj.audience || null,
        };
      })
      .filter((o) => o.description || o.label),
  })).filter((s) => s.objectives.length);

  if (!sections.length) {
    throw new Error('No sections/objectives found in JSON.');
  }

  const raw = {
    title: data.title || data.name || '',
    grade: data.grade || data.grade_band || '',
    subject: (data.subject || 'other').toString().toLowerCase(),
    description: previewText(data.description || ''),
    sections,
  };

  const normalized = normalizeParsedEdusperience(raw);
  return { raw, normalized };
}

export function parseStandardsJson(data) {
  let records = [];
  let meta = {};

  if (Array.isArray(data)) {
    records = data;
  } else if (data && typeof data === 'object') {
    if (Array.isArray(data.records)) records = data.records;
    else throw new Error('JSON must be an array of standards or { records: [...] }.');
    meta = data;
  } else {
    throw new Error('Invalid standards JSON.');
  }

  const mapped = records
    .filter((r) => r && r.code && r.text)
    .map((r) => ({
      code: String(r.code),
      text: String(r.text),
      grade: r.grade || r.grade_band || null,
      strand: r.strand || r.category || r.domain || null,
      strand_name: r.strand_name || r.category_name || r.domain_name || null,
    }));

  if (!mapped.length) {
    throw new Error('No valid standards records (need code + text on each row).');
  }

  return {
    title: meta.title || '',
    subject: (meta.subject || 'other').toString().toLowerCase(),
    grade: meta.grade || meta.grade_band || 'K-12',
    records: mapped,
  };
}

function parseJsonText(text, kind) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('File is not valid JSON.');
  }
  return kind === 'standards' ? parseStandardsJson(data) : parseEdusperienceJson(data);
}

/** Parse an EduSperience upload: JSON locally, PDF/DOCX via Gemini. */
export async function ingestEdusperienceUpload({ file, entityId }) {
  const filePayload = await readPickerAssetAsBase64(file);
  storeFile(entityId, filePayload);

  if (isJsonUpload(file.name, filePayload.mimeType)) {
    const text = await readPickerAssetAsText(file);
    const { raw, normalized } = parseJsonText(text, 'edusperience');
    return { raw, normalized, source: 'json' };
  }

  if (!hasGeminiConfigured()) {
    throw new Error(
      'PDF/DOCX uploads need a Gemini API key in Settings. Or upload a .json EduSperience export.',
    );
  }

  const raw = await parseEdusperienceDocument(entityId);
  const normalized = normalizeParsedEdusperience(raw);
  return { raw, normalized, source: 'gemini' };
}

/** Parse a standards upload: JSON locally, PDF/DOCX via Gemini. */
export async function ingestStandardsUpload({ file, entityId }) {
  const filePayload = await readPickerAssetAsBase64(file);
  storeFile(entityId, filePayload);

  if (isJsonUpload(file.name, filePayload.mimeType)) {
    const text = await readPickerAssetAsText(file);
    const parsed = parseJsonText(text, 'standards');
    return { parsed, source: 'json' };
  }

  if (!hasGeminiConfigured()) {
    throw new Error(
      'PDF/DOCX uploads need a Gemini API key in Settings. Or upload a .json standards file.',
    );
  }

  const parsed = await parseStandardsDocument(entityId);
  return { parsed, source: 'gemini' };
}

/** Load parsed objectives from stored JSON file (no Gemini). */
export function loadParsedEdusperienceFromStore(entityId) {
  const stored = getFile(entityId);
  if (!stored || !isJsonUpload(stored.name, stored.mimeType)) return null;
  const text = readStoredFileAsText(entityId);
  if (!text) return null;
  const { raw, normalized } = parseJsonText(text, 'edusperience');
  return { raw, normalized };
}

export async function ensureParsedEdusperience(entityId) {
  const existing = await dataClient.assignments.getParsed(entityId);
  if (existing?.objectives?.length) return existing;

  const fromJson = loadParsedEdusperienceFromStore(entityId);
  if (fromJson) {
    return {
      ...fromJson.normalized,
      sections: fromJson.raw.sections || [],
    };
  }

  if (!hasGeminiConfigured()) {
    throw new Error('Add a Gemini API key in Settings, or re-upload a .json file.');
  }

  const raw = await parseEdusperienceDocument(entityId);
  const normalized = normalizeParsedEdusperience(raw);
  return { ...normalized, sections: raw.sections || [] };
}
