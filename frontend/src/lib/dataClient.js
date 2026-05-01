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
  // User-created assignments have no curated alignments (no model yet).
  return {
    ...a,
    source: null,
    objectives: [],
    n_total: 0,
    n_aligned: 0,
    standards_db: null,
  };
}

function createAssignment({ name, grade, description, curriculum_id }) {
  ensureInitialized();
  const userAssignments = storage.get(KEY_USER_ASSIGNMENTS, []);
  const row = {
    id: newId('asgn'),
    name: (name || '').trim(),
    grade: (grade || '').trim(),
    description: (description || '').trim(),
    curriculum_id: curriculum_id || null,
    user_id: 'local',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_seed: false,
  };
  storage.set(KEY_USER_ASSIGNMENTS, [row, ...userAssignments]);
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
  const allowed = ['name', 'grade', 'description', 'curriculum_id'];
  const next = { ...rows[idx] };
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch || {}, k)) {
      const v = patch[k];
      next[k] = typeof v === 'string' ? v.trim() : v ?? null;
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

function createCurriculum({ title, grade, file_name, is_public }) {
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
    standards_db: null,
    standards_count: 0,
    subject: null,
    is_seed: false,
  };
  storage.set(KEY_USER_CURRICULA, [row, ...userCurricula]);
  // Auto-adopt your own uploads.
  adoptCurriculum(row.id);
  return row;
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
    create: (input) => wait(createAssignment(input)),
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
  },
  standards: {
    byCurriculum: (id, opts) => wait(standardsByCurriculum(id, opts)),
    usedBy: (id) => wait(standardsUsedBy(id)),
    summary: (id) => wait(standardsSummary(id)),
  },
  dashboard: {
    summary: () => wait(dashboardSummary()),
    edusperiences: () => wait(dashboardEdusperiences()),
  },
  // Dev affordance: blow away localStorage and start over from seed.
  resetLocal: () => { storage.clearAll(); },
};
