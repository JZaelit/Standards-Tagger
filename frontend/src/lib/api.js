const API_BASE = '/align';

/**
 * Run the full alignment pipeline for an uploaded EdusPerience.
 *
 * @param {object} edusperience  — parsed JSON from the uploaded file
 * @param {string|null} subject  — "ela"|"math"|"history"|"science"|null (auto)
 * @returns {Promise<{result: object, elapsed_seconds: number}>}
 */
export async function runAlignment(edusperience, subject = null) {
  const body = { edusperience };
  if (subject) body.subject = subject;

  const res = await fetch(API_BASE, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `API error ${res.status}`);
  }

  return res.json();
}
