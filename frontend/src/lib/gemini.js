// Gemini client — uses Google's official @google/generative-ai SDK (browser-safe).
// Optional local proxy (tools/gemini_proxy.py) for referrer-restricted keys only.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiApiKey, getGeminiProxyUrl } from './settings';
import { filePartForGemini } from './fileStore';

export const DEFAULT_MODEL = 'gemini-2.0-flash';

export const MODEL_CANDIDATES = [
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
];

const PARSE_EDUSPERIENCE_PROMPT = `You are an expert at reading educational assignment documents (PDF, Word, etc.).

Extract the assignment structure as JSON. Include only objectives that describe what the STUDENT must do or produce to demonstrate learning.

Return ONLY valid JSON matching this schema:
{
  "title": "string (assignment title if found, else infer from content)",
  "grade": "string (e.g. 9-10, 5th, K-12 — best guess from content)",
  "subject": "string (ela | math | history | science | other — lowercase)",
  "description": "string (1-3 sentence summary of the student assignment)",
  "sections": [
    {
      "title": "Section name",
      "objectives": [
        {
          "description": "Full objective text as written or inferred",
          "label": "short label optional",
          "audience": "student | educator | platform (who this item is for)",
          "evaluation_type": "optional: platform | ai | ai_assistant | teacher | student | null"
        }
      ]
    }
  ]
}

DO NOT extract as objectives (omit entirely):
- File naming conventions, headers, fonts, margins, submission/upload instructions
- Due dates, point values, account or platform setup
- Section breaks or tooling steps ("insert section break so GradeFlow can…")
- Grading rubrics, scoring guides, or how work will be evaluated
- AI evaluation / assistant configuration (for the tool or teacher, not the student task)
- Teacher facilitation notes ("you will grade…", "the teacher should…")

DO extract:
- Reading, writing, analysis, argument, math, data, research, and other student academic tasks
- Preserve wording from the document when possible.
- If grade/subject unclear, use empty string for grade and "other" for subject.
- Do not invent objectives not supported by the document.`;

const PARSE_STANDARDS_PROMPT = `You are an expert at reading academic standards documents (PDF, Word, state frameworks, CCSS, NGSS, etc.).

Extract every individual standard as a flat list. Return ONLY valid JSON:
{
  "title": "string (name of this standards set, e.g. California CCSS ELA)",
  "subject": "string (ela | math | history | science | other — lowercase)",
  "grade": "string (grade span, e.g. K-12)",
  "records": [
    {
      "code": "standard code (e.g. RL.9-10.1, A-SSE.A.1, HSS-8.1)",
      "text": "full standard text",
      "grade": "grade or band if known, else null",
      "strand": "optional category code (RL, MP, etc.)",
      "strand_name": "optional category name"
    }
  ]
}

Rules:
- One record per leaf-level standard (not parent headings alone).
- Codes must be unique. Use the document's official notation.
- Include Mathematical Practices, anchor standards, and skills standards when present.
- Do not skip standards visible in the document.`;

const TAG_UNIVERSAL_PROMPT = `You are an expert curriculum aligner. Given EduSperience objectives and a standards database, tag only objectives where a STUDENT demonstrates academic knowledge or skill.

## Golden rule
Align student learning tasks only. If the item is for teachers, graders, AI tools, or platform housekeeping, return "alignments": [] and a brief "skip_reason".

## SKIP — return empty alignments (with skip_reason)
- File naming, MLA/header formatting, fonts, margins (unless the standard is explicitly about that skill)
- Submission/upload instructions, due dates, point values, account setup
- Platform mechanics (section breaks, "Data Test", setup verification)
- Grading rubrics, scoring guides, or how work will be evaluated
- AI evaluation / assistant instructions (for the tool or teacher)
- Teacher facilitation notes or "you will grade…"
- Generic effort/participation with no specific standard skill
- Objectives marked audience educator/platform or evaluation_type ai/ai_assistant/teacher

## DO align
- Objectives asking students to read, write, argue, analyze, use math, cite evidence, analyze data, etc.
- When nothing fits, return alignments: [] — do not force a weak match.

Return ONLY valid JSON:
{
  "objectives": [
    {
      "path": "sections[N].objectives[M] (must match input paths exactly)",
      "alignments": [
        {
          "code": "standard code from the provided list ONLY",
          "confidence": "high | medium | low",
          "rationale": "one sentence explaining the fit",
          "source_excerpt": "short quote copied verbatim from the objective text"
        }
      ],
      "skip_reason": "optional — short phrase if alignments is empty (e.g. logistical, educator-only, no standard fit)"
    }
  ]
}

Confidence rubric:
- high: direct, obvious match; objective clearly assesses this standard
- medium: reasonable fit; partial or supporting alignment
- low: tangential; only include if still defensible

Never invent standard codes not in the provided list.`;

function requireKey(overrideKey) {
  const key = (overrideKey || getGeminiApiKey() || '').trim();
  if (!key) {
    throw new Error('Add your Gemini API key in Settings.');
  }
  return key;
}

function formatGeminiError(err) {
  const msg = err?.message || String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('api key not valid') || lower.includes('api_key_invalid')) {
    return (
      'Google says API_KEY_INVALID for the key stored in this browser. '
      + 'Click Clear, then load your key from a .env file (best) or paste fresh and '
      + 'use Show key — letter 2 must be capital I (AIza), not lowercase L (Alza). '
      + 'If it still fails, the key may not be a Gemini key (create one at aistudio.google.com/apikey). '
      + `Raw: ${msg.slice(0, 200)}`
    );
  }
  if (lower.includes('referer') || lower.includes('referrer')) {
    return (
      `${msg} — Set Local proxy URL to http://127.0.0.1:8787 and run npm run gemini-proxy.`
    );
  }
  return msg;
}

function isRetryableModelError(err) {
  const msg = (err?.message || '').toLowerCase();
  return (
    msg.includes('404')
    || msg.includes('not found')
    || msg.includes('not supported')
  );
}

function partsToRest(parts) {
  return (parts || []).map((part) => {
    if (part.text != null) return { text: part.text };
    if (part.inlineData) {
      return {
        inline_data: {
          mime_type: part.inlineData.mimeType,
          data: part.inlineData.data,
        },
      };
    }
    return part;
  });
}

function extractTextFromResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((p) => p.text || '').join('').trim();
}

async function generateViaProxy({ model, parts, jsonMode, apiKey }) {
  const proxyUrl = getGeminiProxyUrl();
  const key = requireKey(apiKey);
  const res = await fetch(`${proxyUrl}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Gemini-Api-Key': key,
    },
    body: JSON.stringify({
      model,
      parts: partsToRest(parts),
      jsonMode,
      apiKey: key,
    }),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Proxy error (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(data?.error?.message || `Proxy error (${res.status})`);
  }
  const text = data.text ?? extractTextFromResponse(data.raw);
  if (!text) throw new Error('Empty response from Gemini proxy.');
  return text;
}

async function generateViaSdk({ model, parts, jsonMode, apiKey }) {
  const key = requireKey(apiKey);
  const genAI = new GoogleGenerativeAI(key);
  const gModel = genAI.getGenerativeModel({
    model,
    generationConfig: jsonMode
      ? { responseMimeType: 'application/json' }
      : undefined,
  });
  const result = await gModel.generateContent(parts);
  return result.response.text();
}

async function generateContent({ model, parts, jsonMode, apiKey }) {
  const proxyUrl = getGeminiProxyUrl();
  if (proxyUrl) {
    return generateViaProxy({ model, parts, jsonMode, apiKey });
  }
  return generateViaSdk({ model, parts, jsonMode, apiKey });
}

async function withModelFallback(run) {
  let lastErr;
  for (const modelName of MODEL_CANDIDATES) {
    try {
      return await run(modelName);
    } catch (err) {
      lastErr = err;
      if (isRetryableModelError(err)) continue;
      throw new Error(formatGeminiError(err));
    }
  }
  throw new Error(formatGeminiError(lastErr));
}

function parseJsonResponse(text) {
  const raw = (text || '').trim();
  if (!raw) throw new Error('Empty response from Gemini.');
  try {
    return JSON.parse(raw);
  } catch (e) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Could not parse Gemini JSON response.');
  }
}

async function generateWithFile({ prompt, entityId, extraParts = [] }) {
  const filePart = filePartForGemini(entityId);
  if (!filePart) {
    throw new Error(
      'Uploaded file not found in local storage. Re-attach the file.',
    );
  }
  const text = await withModelFallback((model) =>
    generateContent({
      model,
      parts: [{ text: prompt }, filePart, ...extraParts],
      jsonMode: true,
    }),
  );
  return parseJsonResponse(text);
}

export async function parseEdusperienceDocument(entityId) {
  return generateWithFile({
    prompt: PARSE_EDUSPERIENCE_PROMPT,
    entityId,
  });
}

export async function parseStandardsDocument(entityId) {
  return generateWithFile({
    prompt: PARSE_STANDARDS_PROMPT,
    entityId,
  });
}

function compactStandards(records, maxChars = 280000) {
  const lines = (records || []).map((r) => ({
    code: r.code,
    text: (r.text || '').slice(0, 400),
    grade: r.grade || r.grade_band || null,
  }));
  let payload = JSON.stringify(lines);
  if (payload.length <= maxChars) return lines;
  const ratio = maxChars / payload.length;
  return lines.map((r) => ({
    ...r,
    text: r.text.slice(0, Math.max(80, Math.floor(r.text.length * ratio))),
  }));
}

function objectivesForPrompt(objectives) {
  return (objectives || []).map((o) => ({
    path: o.path,
    title: o.title || o.label || null,
    section_title: o.section_title,
    description: o.objective_description || o.description,
    evaluation_type: o.evaluation_type || null,
    audience: o.audience || null,
  }));
}

export async function tagAssignmentToStandards({
  objectives,
  standardsRecords,
  grade,
  subject,
  assignmentName,
  standardsSourceLabel = null,
}) {
  const standards = compactStandards(standardsRecords);
  const objPayload = objectivesForPrompt(objectives);
  const sourceLine = standardsSourceLabel
    ? `Standards sources (merged): ${standardsSourceLabel}\n`
    : '';

  const prompt = `${TAG_UNIVERSAL_PROMPT}

Assignment: ${assignmentName || 'Untitled'}
Grade context: ${grade || 'unknown'}
Subject context: ${subject || 'unknown'}
${sourceLine}
OBJECTIVES (return one result per path listed — use skip_reason when not alignable):
${JSON.stringify(objPayload, null, 2)}

STANDARDS DATABASE (${standards.length} records — use codes from this merged list only):
${JSON.stringify(standards)}`;

  const text = await withModelFallback((model) =>
    generateContent({
      model,
      parts: [{ text: prompt }],
      jsonMode: true,
    }),
  );
  const parsed = parseJsonResponse(text);
  return parsed.objectives || [];
}

export async function testGeminiConnection(overrideKey) {
  const key = (overrideKey || getGeminiApiKey() || '').trim();
  if (!key && !getGeminiProxyUrl()) {
    throw new Error('Add your Gemini API key in Settings.');
  }

  const model = await withModelFallback(async (modelName) => {
    const text = await generateContent({
      model: modelName,
      parts: [{ text: 'Reply with exactly: OK' }],
      jsonMode: false,
      apiKey: key,
    });
    if (!text.toUpperCase().includes('OK')) {
      throw new Error(`Unexpected test response: ${text.slice(0, 120)}`);
    }
    return modelName;
  });

  return {
    ok: true,
    model,
    via: getGeminiProxyUrl() ? 'proxy' : 'sdk',
  };
}

export function normalizeParsedEdusperience(parsed) {
  const objectives = [];
  (parsed.sections || []).forEach((sec, si) => {
    (sec.objectives || []).forEach((obj, oi) => {
      objectives.push({
        path: `sections[${si}].objectives[${oi}]`,
        section_idx: si,
        objective_idx: oi,
        section_title: sec.title || `Section ${si + 1}`,
        title: obj.label || '',
        objective_description: obj.description || obj.label || '',
        description: obj.description || obj.label || '',
        evaluation_type: obj.evaluation_type || null,
        audience: obj.audience || null,
        alignments: [],
      });
    });
  });
  return {
    title: parsed.title || '',
    grade: parsed.grade || '',
    subject: parsed.subject || 'other',
    description: parsed.description || '',
    objectives,
    n_total: objectives.length,
    n_aligned: 0,
  };
}

export function mergeTagResults(objectives, tagResults) {
  const byPath = Object.fromEntries(
    (tagResults || []).map((o) => [
      o.path,
      {
        alignments: o.alignments || [],
        skip_reason: (o.skip_reason || '').trim(),
      },
    ]),
  );
  const merged = (objectives || []).map((o) => {
    const result = byPath[o.path];
    if (!result) return o;
    const alignments = result.alignments || [];
    const skipReason = result.skip_reason;
    const next = { ...o, alignments };
    if (!alignments.length && skipReason) {
      next.note = skipReason;
    }
    return next;
  });
  const nAligned = merged.filter((o) => (o.alignments || []).length > 0).length;
  return { objectives: merged, n_aligned: nAligned, n_total: merged.length };
}
