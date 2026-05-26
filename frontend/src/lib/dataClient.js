// Single data API used by the screens. Backed by the bundled SEED dataset
// and a small localStorage layer so user-added items persist across refresh.
//
// Auth still goes through real Supabase (see ./supabase.js); this module
// covers everything else (assignments, curricula, standards, dashboard).
//
// When a real backend lands later, replace the implementations here without
// changing any screen code.

import { SEED } from '../data/seed';
import { storage } from './storage';

const KEY_USER_ASSIGNMENTS = 'assignments';
const KEY_USER_CURRICULA = 'curricula';
const KEY_USER_ADOPTIONS = 'user_curriculum';
const KEY_INITIALIZED = 'initialized';
const KEY_USER_ALIGNMENTS = 'alignments';

const TAGGER_API = 'http://localhost:5000';

// On first run, pre-adopt the curricula whose seeded assignments rely on them.
function ensureInitialized() {
  if (storage.get(KEY_INITIALIZED, false)) return;
  storage.set(KEY_USER_ADOPTIONS, [...SEED.defaultAdoptedCurriculumIds]);
  storage.set(KEY_USER_ASSIGNMENTS, []);
  storage.set(KEY_USER_CURRICULA, []);
  storage.set(KEY_INITIALIZED, true);
}

// Tiny helper so screens can `await dataClient.foo(...)` consistently.
const wait = (v) => Promise.resolve(v);

function newId(prefix = 'u') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ----- Assignments -----

function listAssignments() {
  ensureInitialized();
  const userAssignments = storage.get(KEY_USER_ASSIGNMENTS, []);
  // Most recent first; user-created on top, then seed in seeded order.
  const sortedUser = [...userAssignments].sort(
    (a, b) => (b.created_at || '').localeCompare(a.created_at || '')
  );
  return [...sortedUser, ...SEED.assignments];
}

function getAssignment(id) {
  if (!id) return null;
  const seed = SEED.assignmentById(id);
  if (seed) return seed;
  const userAssignments = storage.get(KEY_USER_ASSIGNMENTS, []);
  return userAssignments.find((a) => a.id === id) || null;
}

function getAssignmentDetail(id) {
  const a = getAssignment(id);
  if (!a) return null;
  if (a.is_seed && a.stem) {
    return SEED.assignmentDetail(a.stem);
  }
  // Check for stored alignment from the tagger API.
  const alignments = storage.get(KEY_USER_ALIGNMENTS, {});
  const alignment = alignments[id];
  if (alignment) {
    const objectives = (alignment.objectives || []).map((o) => {
      const m = /sections\[(\d+)\]\.objectives\[(\d+)\]/.exec(o.path || '');
      const sec = m ? parseInt(m[1], 10) : 0;
      const obj = m ? parseInt(m[2], 10) : 0;
      return {
        ...o,
        section_idx: sec,
        objective_idx: obj,
        section_title: o.section_title || `Section ${sec + 1}`,
      };
    });
    return {
      ...a,
      source: null,
      objectives,
      n_total: alignment.n_total ?? objectives.length,
      n_aligned: alignment.n_aligned ?? objectives.filter((o) => (o.alignments || []).length > 0).length,
      standards_db: alignment.standards_db || null,
      subject: alignment.subject || a.subject,
    };
  }
  // No alignment yet — shows the "Awaiting AI tagger" pending state.
  return {
    ...a,
    source: null,
    objectives: [],
    n_total: 0,
    n_aligned: 0,
    standards_db: null,
  };
}

async function createAssignment({
  name, grade, description, curriculum_id, subject, file_name,
}) {
  ensureInitialized();
  const userAssignments = storage.get(KEY_USER_ASSIGNMENTS, []);
  const row = {
    id: newId('asgn'),
    name: (name || '').trim(),
    grade: (grade || '').trim(),
    description: (description || '').trim(),
    curriculum_id: curriculum_id || null,
    subject: (subject || '').trim().toLowerCase() || null,
    file_name: file_name || null,
    user_id: 'local',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_seed: false,
  };
  storage.set(KEY_USER_ASSIGNMENTS, [row, ...userAssignments]);

  // Call the tagger API to run the alignment pipeline.
  if (row.description) {
    try {
      const resp = await fetch(`${TAGGER_API}/api/tag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: row.name,
          grade: row.grade,
          subject: row.subject || 'auto',
          description: row.description,
        }),
      });
      if (resp.ok) {
        const alignment = await resp.json();
        const alignments = storage.get(KEY_USER_ALIGNMENTS, {});
        alignments[row.id] = alignment;
        storage.set(KEY_USER_ALIGNMENTS, alignments);
        // Update subject if auto-detected
        if (!row.subject && alignment.subject) {
          const rows = storage.get(KEY_USER_ASSIGNMENTS, []);
          const idx = rows.findIndex((a) => a.id === row.id);
          if (idx !== -1) {
            rows[idx] = { ...rows[idx], subject: alignment.subject };
            storage.set(KEY_USER_ASSIGNMENTS, rows);
            row.subject = alignment.subject;
          }
        }
      }
    } catch (_) {
      // API unavailable — assignment saved without alignments, shows pending state.
    }
  }

  return row;
}

// Patch fields on a user-created assignment. Refuses to touch seeded rows
// (they live in the bundled SEED dataset, not localStorage). Returns the
// updated row, or null if the id wasn't found / belongs to a seed.
function updateAssignment(id, patch) {
  ensureInitialized();
  if (!id) return null;
  if (SEED.assignmentById(id)) return null;
  const rows = storage.get(KEY_USER_ASSIGNMENTS, []);
  const idx = rows.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const allowed = [
    'name', 'grade', 'description',
    'curriculum_id', 'subject', 'file_name',
  ];
  const next = { ...rows[idx] };
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch || {}, k)) {
      const v = patch[k];
      if (k === 'subject') {
        next[k] = typeof v === 'string'
          ? (v.trim().toLowerCase() || null)
          : (v ?? null);
      } else {
        next[k] = typeof v === 'string' ? v.trim() : v ?? null;
      }
    }
  }
  next.updated_at = new Date().toISOString();
  const updated = [...rows];
  updated[idx] = next;
  storage.set(KEY_USER_ASSIGNMENTS, updated);
  return next;
}

// Hard-delete a user-created assignment. Refuses to touch seeded rows.
// Returns the removed row + its prior list index so callers can implement
// an undo by re-inserting at the same position.
function deleteAssignment(id) {
  ensureInitialized();
  if (!id) return null;
  if (SEED.assignmentById(id)) return null;
  const rows = storage.get(KEY_USER_ASSIGNMENTS, []);
  const idx = rows.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const removed = rows[idx];
  const next = rows.slice(0, idx).concat(rows.slice(idx + 1));
  storage.set(KEY_USER_ASSIGNMENTS, next);
  return { row: removed, index: idx };
}

// Re-insert a previously-deleted user assignment at a specific index.
// Used by the undo-toast flow on EvalScreen.
function restoreAssignment(row, index) {
  ensureInitialized();
  if (!row || !row.id) return null;
  if (SEED.assignmentById(row.id)) return null;
  const rows = storage.get(KEY_USER_ASSIGNMENTS, []);
  const safeIdx = Math.max(0, Math.min(rows.length, index ?? 0));
  const next = rows.slice(0, safeIdx).concat([row], rows.slice(safeIdx));
  storage.set(KEY_USER_ASSIGNMENTS, next);
  return row;
}

// ----- Curricula -----

function listAdoptedCurricula() {
  ensureInitialized();
  const adoptedIds = storage.get(KEY_USER_ADOPTIONS, []);
  const userCurricula = storage.get(KEY_USER_CURRICULA, []);
  const seedAdopted = SEED.curricula.filter((c) => adoptedIds.includes(c.id));
  // User-uploaded curricula are always considered "adopted" by their author.
  return [...userCurricula, ...seedAdopted];
}

function listLibraryCurricula() {
  ensureInitialized();
  const userCurricula = storage.get(KEY_USER_CURRICULA, []);
  // Public library = seeded public curricula + user-uploaded public curricula.
  const seedPublic = SEED.curricula.filter((c) => c.is_public);
  const userPublic = userCurricula.filter((c) => c.is_public);
  return [...seedPublic, ...userPublic];
}

function searchCurricula(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  return listLibraryCurricula().filter((c) =>
    (c.title || '').toLowerCase().includes(q)
  );
}

function getCurriculum(id) {
  if (!id) return null;
  const seed = SEED.curriculumById(id);
  if (seed) return seed;
  const userCurricula = storage.get(KEY_USER_CURRICULA, []);
  return userCurricula.find((c) => c.id === id) || null;
}

function adoptCurriculum(id) {
  ensureInitialized();
  const adopted = storage.get(KEY_USER_ADOPTIONS, []);
  if (adopted.includes(id)) return;
  storage.set(KEY_USER_ADOPTIONS, [...adopted, id]);
}

function createCurriculum({ title, grade, file_name, is_public, subject }) {
  ensureInitialized();
  const userCurricula = storage.get(KEY_USER_CURRICULA, []);
  const row = {
    id: newId('curr'),
    title: (title || '').trim(),
    grade: (grade || '').trim(),
    file_name: file_name || null,
    is_public: is_public !== false,
    uploaded_by: 'local',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    standards_db: null,
    standards_count: 0,
    subject: (subject || '').trim().toLowerCase() || null,
    is_seed: false,
  };
  storage.set(KEY_USER_CURRICULA, [row, ...userCurricula]);
  // Auto-adopt your own uploads.
  adoptCurriculum(row.id);
  return row;
}

// Patch fields on a user-created curriculum. Refuses to touch seed rows
// (the bundled CA-* curricula are read-only). Returns the updated row, or
// null if id is unknown / belongs to a seed.
function updateCurriculum(id, patch) {
  ensureInitialized();
  if (!id) return null;
  if (SEED.curriculumById(id)) return null;
  const rows = storage.get(KEY_USER_CURRICULA, []);
  const idx = rows.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const allowed = ['title', 'grade', 'file_name', 'is_public', 'subject'];
  const next = { ...rows[idx] };
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch || {}, k)) {
      const v = patch[k];
      if (k === 'subject') {
        next[k] = typeof v === 'string'
          ? (v.trim().toLowerCase() || null)
          : (v ?? null);
      } else {
        next[k] = typeof v === 'string' ? v.trim() : v;
      }
    }
  }
  next.updated_at = new Date().toISOString();
  const updated = [...rows];
  updated[idx] = next;
  storage.set(KEY_USER_CURRICULA, updated);
  return next;
}

// Hard-delete a user-created curriculum. Refuses to touch seed rows.
// Returns { row, index, was_adopted } so callers can implement undo.
// Note: assignments referencing this curriculum are NOT cascaded; they
// gracefully fall back to "Unlinked" in OutputScreen via the null lookup.
function deleteCurriculum(id) {
  ensureInitialized();
  if (!id) return null;
  if (SEED.curriculumById(id)) return null;
  const rows = storage.get(KEY_USER_CURRICULA, []);
  const idx = rows.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const removed = rows[idx];
  const next = rows.slice(0, idx).concat(rows.slice(idx + 1));
  storage.set(KEY_USER_CURRICULA, next);
  // Also drop the adoption link, if any.
  const adopted = storage.get(KEY_USER_ADOPTIONS, []);
  const wasAdopted = adopted.includes(id);
  if (wasAdopted) {
    storage.set(
      KEY_USER_ADOPTIONS,
      adopted.filter((a) => a !== id),
    );
  }
  return { row: removed, index: idx, was_adopted: wasAdopted };
}

function restoreCurriculum(row, index, wasAdopted) {
  ensureInitialized();
  if (!row || !row.id) return null;
  if (SEED.curriculumById(row.id)) return null;
  const rows = storage.get(KEY_USER_CURRICULA, []);
  const safeIdx = Math.max(0, Math.min(rows.length, index ?? 0));
  const next = rows.slice(0, safeIdx).concat([row], rows.slice(safeIdx));
  storage.set(KEY_USER_CURRICULA, next);
  if (wasAdopted) adoptCurriculum(row.id);
  return row;
}

// "Remove from my list" semantic for library/seed curricula. The
// curriculum itself stays in the public library; only the user's adoption
// link is removed. Returns true if it was adopted (so callers can offer
// re-adopt as undo). For user-created rows, prefer deleteCurriculum.
function unadoptCurriculum(id) {
  ensureInitialized();
  if (!id) return false;
  const adopted = storage.get(KEY_USER_ADOPTIONS, []);
  if (!adopted.includes(id)) return false;
  storage.set(
    KEY_USER_ADOPTIONS,
    adopted.filter((a) => a !== id),
  );
  return true;
}

// ----- Standards -----

// History records lack strand/category/domain; their natural taxonomy is the
// `section` field ("K-5 Content", "9-12 Analysis Skills", etc.). This helper
// returns whatever bucket a single record belongs in, regardless of subject.
function bucketOf(r) {
  return (
    r.strand
    || r.category
    || r.skill_category_code
    || r.domain
    || r.section
    || (r.is_practice ? 'MP' : 'Other')
  );
}

function standardsByCurriculum(curriculumId, opts = {}) {
  const records = SEED.standardsRecordsByCurriculumId[curriculumId] || [];
  let filtered = records;
  const { search, strand, grade, limit, offset = 0 } = opts;
  if (strand) {
    filtered = filtered.filter((r) => bucketOf(r) === strand);
  }
  if (grade) {
    filtered = filtered.filter((r) =>
      r.grade === grade || r.grade_band === grade
    );
  }
  if (search) {
    const q = String(search).toLowerCase();
    filtered = filtered.filter((r) =>
      (r.code || '').toLowerCase().includes(q) ||
      (r.text || '').toLowerCase().includes(q) ||
      (r.strand_name || r.category_name || r.domain_name || r.skill_category || '')
        .toLowerCase().includes(q)
    );
  }
  const total = filtered.length;
  const page = limit != null ? filtered.slice(offset, offset + limit) : filtered;
  return { rows: page, total };
}

// Standards a user has actually seen used by their seed assignments under
// this curriculum. Useful for the "Used in your assignments" filter.
function standardsUsedBy(curriculumId) {
  const recordIndex = SEED.standardsIndexByCurriculumId[curriculumId] || {};
  const usedCodes = new Set();
  for (const a of SEED.assignments) {
    if (a.curriculum_id !== curriculumId) continue;
    const detail = SEED.assignmentDetail(a.stem);
    if (!detail) continue;
    for (const o of detail.objectives) {
      for (const al of o.alignments || []) {
        if (al && al.code) usedCodes.add(al.code);
      }
    }
  }
  return [...usedCodes].map((code) => recordIndex[code]).filter(Boolean);
}

// Cross-curriculum lookup: find which curriculum a standards code belongs
// to, plus the record itself. Used by the Dashboard to navigate from a
// global "top codes" view into the right CurriculumDetail screen with
// the focus-flash. Returns null if the code isn't in any seeded
// curriculum's standards index.
function findStandardByCode(code) {
  if (!code) return null;
  for (const c of SEED.curricula) {
    const rec = SEED.standardsIndexByCurriculumId[c.id]?.[code];
    if (rec) {
      return { curriculum_id: c.id, curriculum: c, record: rec };
    }
  }
  return null;
}

// Reverse index: for a given curriculum, which assignments use each code?
// Returns a plain object: { 'A-SSE.A.1.b': [{id, name, stem}, ...], ... }.
// Computed once per curriculum and consumed by CurriculumDetailScreen so
// the per-row "Used in:" links don't need to re-scan all assignments per
// rendered row.
//
// Only includes seed assignments today (the only ones with curated
// alignments). User-created rows have empty objective sets in the
// placeholder phase, so they never contribute to the usage map.
function standardsUsageMap(curriculumId) {
  const map = {};
  for (const a of SEED.assignments) {
    if (a.curriculum_id !== curriculumId) continue;
    const detail = SEED.assignmentDetail(a.stem);
    if (!detail) continue;
    const ref = { id: a.id, name: a.name, stem: a.stem };
    for (const o of detail.objectives) {
      for (const al of o.alignments || []) {
        if (!al || !al.code) continue;
        if (!map[al.code]) map[al.code] = [];
        // Avoid duplicates when one assignment uses the same code on
        // multiple objectives.
        if (!map[al.code].some((x) => x.id === ref.id)) {
          map[al.code].push(ref);
        }
      }
    }
  }
  return map;
}

// Returns counts by strand/category/skill_category and by grade for the
// summary header on CurriculumDetailScreen. Returns null when the curriculum
// has no bundled standards (user-uploaded curricula in the placeholder phase).
function standardsSummary(curriculumId) {
  const records = SEED.standardsRecordsByCurriculumId[curriculumId];
  if (!records) return null;
  const byStrand = {};
  const byGrade = {};
  for (const r of records) {
    const strand = bucketOf(r);
    byStrand[strand] = (byStrand[strand] || 0) + 1;
    const grade = r.grade || r.grade_band || 'unspecified';
    byGrade[grade] = (byGrade[grade] || 0) + 1;
  }
  // Sort strands by count desc, grades by natural order.
  const strandList = Object.entries(byStrand)
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => ({ code, n }));
  const gradeList = Object.entries(byGrade)
    .sort((a, b) => gradeOrderKey(a[0]) - gradeOrderKey(b[0]))
    .map(([grade, n]) => ({ grade, n }));
  return {
    total: records.length,
    strands: strandList,
    grades: gradeList,
  };
}

// Lower number sorts first. K -> 0, 1 -> 1, ..., 12 -> 12, ranges by their
// starting grade ('9-10' -> 9, '11-12' -> 11, 'K-5' -> 0).
function gradeOrderKey(g) {
  if (!g || g === 'unspecified') return 999;
  const s = String(g);
  if (s === 'K') return 0;
  const start = s.split('-')[0];
  if (start === 'K') return 0;
  const n = parseInt(start, 10);
  return Number.isFinite(n) ? n : 998;
}

// ----- Dashboard summary (cross-edusperience aggregates) -----

function dashboardSummary() {
  let totalObjectives = 0;
  let alignedObjectives = 0;
  const codeCounter = {};
  const confCounter = { high: 0, medium: 0, low: 0 };
  const bySubject = {};
  for (const a of SEED.assignments) {
    bySubject[a.subject] = (bySubject[a.subject] || 0) + 1;
    const detail = SEED.assignmentDetail(a.stem);
    if (!detail) continue;
    totalObjectives += detail.n_total;
    alignedObjectives += detail.n_aligned;
    for (const o of detail.objectives) {
      for (const al of o.alignments || []) {
        codeCounter[al.code] = (codeCounter[al.code] || 0) + 1;
        const c = al.confidence;
        if (c && Object.prototype.hasOwnProperty.call(confCounter, c)) {
          confCounter[c] += 1;
        }
      }
    }
  }
  const totalAssignments = Object.values(codeCounter).reduce((s, n) => s + n, 0);
  const distinct = Object.keys(codeCounter).length;
  const topCodes = Object.entries(codeCounter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([code, n]) => ({ code, n }));
  return {
    edusperiences: SEED.assignments.length,
    total_objectives: totalObjectives,
    aligned_objectives: alignedObjectives,
    pct_aligned: totalObjectives > 0
      ? Math.round((1000 * alignedObjectives) / totalObjectives) / 10
      : 0,
    total_code_assignments: totalAssignments,
    distinct_codes: distinct,
    confidence_mix: confCounter,
    top_codes: topCodes,
    by_subject: bySubject,
    standards_dbs: SEED.curricula.length,
  };
}

// Cards for the per-edusperience strip at the bottom of DashboardScreen.
// Each card has the assignment's id (so we can navigate to OutputScreen) and
// quick-glance stats from its detail record.
function dashboardEdusperiences() {
  return SEED.assignments.map((a) => {
    const detail = SEED.assignmentDetail(a.stem);
    const distinctCodes = new Set();
    if (detail) {
      for (const o of detail.objectives) {
        for (const al of o.alignments || []) {
          if (al && al.code) distinctCodes.add(al.code);
        }
      }
    }
    return {
      id: a.id,
      name: a.name,
      stem: a.stem,
      subject: a.subject,
      grade: a.grade,
      n_total: detail ? detail.n_total : 0,
      n_aligned: detail ? detail.n_aligned : 0,
      distinct_codes: distinctCodes.size,
      curriculum_id: a.curriculum_id,
    };
  });
}

// ----- Public API -----

export const dataClient = {
  assignments: {
    list: () => wait(listAssignments()),
    get: (id) => wait(getAssignment(id)),
    detail: (id) => wait(getAssignmentDetail(id)),
    create: (input) => createAssignment(input),
    update: (id, patch) => wait(updateAssignment(id, patch)),
    // Returns { row, index } for undo, or null if id is unknown / seed.
    delete: (id) => wait(deleteAssignment(id)),
    restore: (row, index) => wait(restoreAssignment(row, index)),
  },
  curricula: {
    listForUser: () => wait(listAdoptedCurricula()),
    listLibrary: () => wait(listLibraryCurricula()),
    search: (q) => wait(searchCurricula(q)),
    get: (id) => wait(getCurriculum(id)),
    addToUser: (id) => { adoptCurriculum(id); return wait(undefined); },
    create: (input) => wait(createCurriculum(input)),
    update: (id, patch) => wait(updateCurriculum(id, patch)),
    // Returns { row, index, was_adopted } for undo, or null if id is unknown / seed.
    delete: (id) => wait(deleteCurriculum(id)),
    restore: (row, index, wasAdopted) =>
      wait(restoreCurriculum(row, index, wasAdopted)),
    // Remove from this user's adopted list (library curricula). Returns
    // true if it was adopted before, so callers can show an undo.
    unadopt: (id) => wait(unadoptCurriculum(id)),
  },
  standards: {
    byCurriculum: (id, opts) => wait(standardsByCurriculum(id, opts)),
    usedBy: (id) => wait(standardsUsedBy(id)),
    summary: (id) => wait(standardsSummary(id)),
    // { code -> [{id, name, stem}, ...] } for the curriculum's used codes.
    usageMap: (id) => wait(standardsUsageMap(id)),
    // Cross-curriculum: { curriculum_id, curriculum, record } | null.
    findByCode: (code) => wait(findStandardByCode(code)),
  },
  dashboard: {
    summary: () => wait(dashboardSummary()),
    edusperiences: () => wait(dashboardEdusperiences()),
  },
  // Dev affordance: blow away localStorage and start over from seed.
  resetLocal: () => { storage.clearAll(); },
};
