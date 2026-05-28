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
import { countsTowardAlignmentCoverage } from './alignmentScope';

const KEY_USER_ASSIGNMENTS = 'assignments';
const KEY_USER_CURRICULA = 'curricula';
const KEY_USER_ADOPTIONS = 'user_curriculum';
const KEY_INITIALIZED = 'initialized';
const KEY_ALIGNMENTS = 'alignments';
const KEY_PARSED = 'parsed_edusperiences';
const KEY_USER_STANDARDS = 'user_standards_records';
const KEY_HIDDEN_ASSIGNMENTS = 'hidden_seed_assignments';
const KEY_HIDDEN_CURRICULA = 'hidden_seed_curricula';
const KEY_SECTION_METRICS = 'assignment_section_metrics';
const KEY_CURRICULUM_REVIEW_QUEUE = 'curriculum_review_queue';

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

function hiddenAssignmentIds() {
  return new Set(storage.get(KEY_HIDDEN_ASSIGNMENTS, []));
}

function hiddenCurriculumIds() {
  return new Set(storage.get(KEY_HIDDEN_CURRICULA, []));
}

function excludedSectionsForAssignment(id) {
  if (!id) return new Set();
  const map = storage.get(KEY_SECTION_METRICS, {});
  return new Set((map[id] || []).map(Number));
}

function alignmentStatsForObjectives(objectives, excludedSections = new Set()) {
  const filtered = (objectives || []).filter(
    (o) => !excludedSections.has(Number(o.section_idx)),
  );
  const inScope = filtered.filter(countsTowardAlignmentCoverage);
  return {
    n_total: inScope.length,
    n_aligned: inScope.filter((o) => (o.alignments || []).length > 0).length,
  };
}

function applySectionMetrics(id, detail) {
  if (!detail) return null;
  const excluded = excludedSectionsForAssignment(id);
  const stats = alignmentStatsForObjectives(detail.objectives, excluded);
  return {
    ...detail,
    ...stats,
    excluded_sections: [...excluded],
  };
}

function setSectionIncluded(id, sectionIdx, included) {
  ensureInitialized();
  if (id == null || sectionIdx == null) return [];
  const idx = Number(sectionIdx);
  const map = storage.get(KEY_SECTION_METRICS, {});
  const excluded = new Set((map[id] || []).map(Number));
  if (included) excluded.delete(idx);
  else excluded.add(idx);
  map[id] = [...excluded];
  storage.set(KEY_SECTION_METRICS, map);
  return map[id];
}

function enrichAssignmentRow(row) {
  if (!row?.id) return row;
  const detail = getAssignmentDetail(row.id);
  if (detail) {
    return {
      ...row,
      n_total: detail.n_total ?? 0,
      n_aligned: detail.n_aligned ?? 0,
      curriculum_id: detail.alignment_curriculum_id ?? detail.curriculum_id ?? row.curriculum_id ?? null,
      parse_status: detail.parse_status ?? row.parse_status,
      tag_status: detail.tag_status ?? row.tag_status,
    };
  }
  return {
    ...row,
    n_total: 0,
    n_aligned: 0,
  };
}

function listAssignments() {
  ensureInitialized();
  const hidden = hiddenAssignmentIds();
  const userAssignments = storage.get(KEY_USER_ASSIGNMENTS, []);
  const sortedUser = [...userAssignments].sort(
    (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
  );
  const seeds = SEED.assignments.filter((a) => !hidden.has(a.id));
  return [...sortedUser, ...seeds].map(enrichAssignmentRow);
}

function getAssignment(id) {
  if (!id) return null;
  const hidden = hiddenAssignmentIds();
  const seed = SEED.assignmentById(id);
  if (seed) {
    if (hidden.has(id)) return null;
    return seed;
  }
  const userAssignments = storage.get(KEY_USER_ASSIGNMENTS, []);
  return userAssignments.find((a) => a.id === id) || null;
}

// Visible user + seed assignments with their detail records. Used by dashboard
// and standards usage so deleted/hidden assignments are excluded everywhere.
function assignmentsWithDetailsForStats() {
  ensureInitialized();
  const hidden = hiddenAssignmentIds();
  const out = [];
  for (const a of storage.get(KEY_USER_ASSIGNMENTS, [])) {
    const detail = getAssignmentDetail(a.id);
    if (detail) out.push({ assignment: a, detail });
  }
  for (const a of SEED.assignments) {
    if (hidden.has(a.id)) continue;
    const detail = getAssignmentDetail(a.id);
    if (detail) out.push({ assignment: a, detail });
  }
  return out;
}

function getParsedEdusperience(id) {
  if (!id) return null;
  return storage.get(KEY_PARSED, {})[id] || null;
}

function saveParsedEdusperience(id, parsed) {
  if (!id || !parsed) return null;
  const map = storage.get(KEY_PARSED, {});
  map[id] = { ...parsed, saved_at: new Date().toISOString() };
  storage.set(KEY_PARSED, map);
  return map[id];
}

function getAlignment(id) {
  if (!id) return null;
  return storage.get(KEY_ALIGNMENTS, {})[id] || null;
}

function saveAlignment(id, payload) {
  if (!id) return null;
  const map = storage.get(KEY_ALIGNMENTS, {});
  map[id] = {
    ...payload,
    tagged_at: new Date().toISOString(),
  };
  storage.set(KEY_ALIGNMENTS, map);
  return map[id];
}

function standardsRecordsForCurricula(curriculumIds) {
  const seen = new Set();
  const merged = [];
  for (const id of curriculumIds || []) {
    for (const r of standardsRecordsForCurriculum(id)) {
      const code = r?.code;
      if (!code || seen.has(code)) continue;
      seen.add(code);
      merged.push(r);
    }
  }
  return merged;
}

function standardsTextByCodeForCurricula(curriculumIds) {
  const map = {};
  for (const id of curriculumIds || []) {
    for (const r of standardsRecordsForCurriculum(id)) {
      if (r.code && r.text && !map[r.code]) map[r.code] = r.text;
    }
  }
  return map;
}

function withAlignmentText(curriculumIds, alignments = []) {
  const ids = Array.isArray(curriculumIds)
    ? curriculumIds
    : (curriculumIds ? [curriculumIds] : []);
  const textByCode = standardsTextByCodeForCurricula(ids);
  return (alignments || []).map((a) => {
    const text = (a?.text || '').trim() || textByCode[a?.code] || '';
    return { ...a, text };
  });
}

function upsertObjectiveAlignments(id, payload) {
  const { sectionIdx, objectiveIdx, alignments = [] } = payload || {};
  if (!id || sectionIdx == null || objectiveIdx == null) return null;
  const detail = getAssignmentDetail(id);
  if (!detail || !detail.objectives?.length) return null;
  const currIds = detail.alignment_curriculum_ids?.length
    ? [...detail.alignment_curriculum_ids]
    : (detail.alignment_curriculum_id || detail.curriculum_id
        ? [detail.alignment_curriculum_id || detail.curriculum_id]
        : []);
  const normalized = withAlignmentText(currIds, alignments).filter((a) => a?.code);
  const objectives = (detail.objectives || []).map((o) => {
    if (Number(o.section_idx) !== Number(sectionIdx) || Number(o.objective_idx) !== Number(objectiveIdx)) {
      return o;
    }
    return { ...o, alignments: normalized };
  });
  return saveAlignment(id, {
    curriculum_id: currIds[0] || null,
    curriculum_ids: currIds,
    curriculum_title: detail.curriculum_title || null,
    objectives,
    n_total: objectives.length,
    n_aligned: objectives.filter((o) => (o.alignments || []).length > 0).length,
  });
}

function getUserStandardsRecords(curriculumId) {
  if (!curriculumId) return null;
  return storage.get(KEY_USER_STANDARDS, {})[curriculumId] || null;
}

function saveUserStandardsRecords(curriculumId, records) {
  if (!curriculumId) return null;
  const map = storage.get(KEY_USER_STANDARDS, {});
  map[curriculumId] = records;
  storage.set(KEY_USER_STANDARDS, map);
  return records;
}

function getAssignmentDetail(id) {
  const a = getAssignment(id);
  if (!a) return null;

  let detail;
  if (a.is_seed && a.stem) {
    detail = SEED.assignmentDetail(a.stem);
  } else {
    const parsed = getParsedEdusperience(id);
    const alignment = getAlignment(id);
    const objectives = (alignment?.objectives || parsed?.objectives || []).map((o) => ({
      ...o,
      section_description:
        o.section_description
        || parsed?.sections?.[o.section_idx]?.description
        || '',
      title: o.title || o.objective_title || '',
      description: o.description || o.objective_description || '',
    }));
    const curriculumIds = alignment?.curriculum_ids?.length
      ? [...alignment.curriculum_ids]
      : (alignment?.curriculum_id ?? a.curriculum_id
          ? [alignment.curriculum_id ?? a.curriculum_id]
          : []);
    const curriculumId = curriculumIds[0] ?? null;
    const curriculum = curriculumId ? getCurriculum(curriculumId) : null;
    const curriculumTitle = alignment?.curriculum_title
      || curriculumIds
        .map((cid) => getCurriculum(cid)?.title)
        .filter(Boolean)
        .join(' + ')
      || null;
    detail = {
      ...a,
      source: parsed
        ? {
            title: parsed.title || a.name,
            description: parsed.description || a.description,
            sections: (parsed.sections || []).map((s, i) => ({
              title: s.title || `Section ${i + 1}`,
              description: s.description || '',
              objectives: (s.objectives || []).map((o, j) => ({
                title: o.label || o.title || '',
                description: o.description || o.label || '',
                path: `sections[${i}].objectives[${j}]`,
              })),
            })),
          }
        : null,
      objectives,
      n_total: objectives.length,
      n_aligned: objectives.filter((o) => (o.alignments || []).length > 0).length,
      standards_db: curriculum?.standards_db || null,
      alignment_curriculum_id: curriculumId,
      alignment_curriculum_ids: curriculumIds,
      curriculum_title: curriculumTitle,
      tagged_at: alignment?.tagged_at || null,
      parse_status: parsed ? 'parsed' : (a.file_name ? 'needs_parse' : 'empty'),
      tag_status: alignment ? 'tagged' : 'pending',
    };
  }

  return applySectionMetrics(id, detail);
}

function createAssignment({
  name, grade, description, subject, file_name,
}) {
  ensureInitialized();
  const userAssignments = storage.get(KEY_USER_ASSIGNMENTS, []);
  const row = {
    id: newId('asgn'),
    name: (name || '').trim(),
    grade: (grade || '').trim(),
    description: (description || '').trim(),
    curriculum_id: null,
    subject: (subject || '').trim().toLowerCase() || null,
    file_name: file_name || null,
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
  const allowed = ['name', 'grade', 'description', 'subject', 'file_name'];
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
function hideSeedAssignment(id) {
  ensureInitialized();
  if (!SEED.assignmentById(id)) return false;
  const hidden = storage.get(KEY_HIDDEN_ASSIGNMENTS, []);
  if (hidden.includes(id)) return true;
  storage.set(KEY_HIDDEN_ASSIGNMENTS, [...hidden, id]);
  return true;
}

function deleteAssignment(id) {
  ensureInitialized();
  if (!id) return null;
  if (SEED.assignmentById(id)) {
    hideSeedAssignment(id);
    return { row: SEED.assignmentById(id), index: -1, hidden_seed: true };
  }
  const rows = storage.get(KEY_USER_ASSIGNMENTS, []);
  const idx = rows.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const removed = rows[idx];
  const next = rows.slice(0, idx).concat(rows.slice(idx + 1));
  storage.set(KEY_USER_ASSIGNMENTS, next);
  const parsed = storage.get(KEY_PARSED, {});
  const align = storage.get(KEY_ALIGNMENTS, {});
  delete parsed[id];
  delete align[id];
  storage.set(KEY_PARSED, parsed);
  storage.set(KEY_ALIGNMENTS, align);
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
  const hidden = hiddenCurriculumIds();
  const userCurricula = storage.get(KEY_USER_CURRICULA, []);
  const seedAdopted = SEED.curricula.filter(
    (c) => adoptedIds.includes(c.id) && !hidden.has(c.id),
  );
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

function createCurriculum({
  title, grade, file_name, is_public, subject, standards_count, grade_tags, subject_tags,
}) {
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
    standards_count: standards_count || 0,
    subject: (subject || '').trim().toLowerCase() || null,
    grade_tags: Array.isArray(grade_tags) ? grade_tags : [],
    subject_tags: Array.isArray(subject_tags) ? subject_tags : [],
    is_seed: false,
  };
  storage.set(KEY_USER_CURRICULA, [row, ...userCurricula]);
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
  const allowed = ['title', 'grade', 'file_name', 'is_public', 'subject', 'standards_count', 'grade_tags', 'subject_tags'];
  const next = { ...rows[idx] };
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch || {}, k)) {
      const v = patch[k];
      if (k === 'subject') {
        next[k] = typeof v === 'string'
          ? (v.trim().toLowerCase() || null)
          : (v ?? null);
      } else if (k === 'grade_tags' || k === 'subject_tags') {
        next[k] = Array.isArray(v) ? v : [];
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
function hideSeedCurriculum(id) {
  ensureInitialized();
  if (!SEED.curriculumById(id)) return false;
  const hidden = storage.get(KEY_HIDDEN_CURRICULA, []);
  if (hidden.includes(id)) return true;
  storage.set(KEY_HIDDEN_CURRICULA, [...hidden, id]);
  const adopted = storage.get(KEY_USER_ADOPTIONS, []);
  if (adopted.includes(id)) {
    storage.set(
      KEY_USER_ADOPTIONS,
      adopted.filter((a) => a !== id),
    );
  }
  return true;
}

function deleteCurriculum(id) {
  ensureInitialized();
  if (!id) return null;
  if (SEED.curriculumById(id)) {
    hideSeedCurriculum(id);
    return {
      row: SEED.curriculumById(id),
      index: -1,
      was_adopted: true,
      hidden_seed: true,
    };
  }
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

function standardsRecordsForCurriculum(curriculumId) {
  const userRecs = getUserStandardsRecords(curriculumId);
  if (userRecs && userRecs.length) return userRecs;
  return SEED.standardsRecordsByCurriculumId[curriculumId] || [];
}

/** { [code]: description } for tooltips and inline standard text. */
function standardsTextByCode(curriculumId) {
  const map = {};
  for (const r of standardsRecordsForCurriculum(curriculumId)) {
    if (r.code && r.text) map[r.code] = r.text;
  }
  return map;
}

function submitCurriculumForReview(payload) {
  const row = {
    id: newId('review'),
    created_at: new Date().toISOString(),
    status: 'pending',
    ...payload,
  };
  const queue = storage.get(KEY_CURRICULUM_REVIEW_QUEUE, []);
  storage.set(KEY_CURRICULUM_REVIEW_QUEUE, [row, ...queue]);
  return row;
}

function listCurriculumReviewQueue() {
  return storage.get(KEY_CURRICULUM_REVIEW_QUEUE, []);
}

function standardsByCurriculum(curriculumId, opts = {}) {
  const records = standardsRecordsForCurriculum(curriculumId);
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

function assignmentUsesCurriculum(detail, assignment, curriculumId) {
  const ids = detail.alignment_curriculum_ids?.length
    ? detail.alignment_curriculum_ids
    : (detail.alignment_curriculum_id ?? assignment.curriculum_id
        ? [detail.alignment_curriculum_id ?? assignment.curriculum_id]
        : []);
  return ids.includes(curriculumId);
}

// Standards a user has actually seen used by their seed assignments under
// this curriculum. Useful for the "Used in your assignments" filter.
function standardsUsedBy(curriculumId) {
  const recordIndex = SEED.standardsIndexByCurriculumId[curriculumId] || {};
  const usedCodes = new Set();
  for (const { assignment: a, detail } of assignmentsWithDetailsForStats()) {
    if (!assignmentUsesCurriculum(detail, a, curriculumId)) continue;
    const excluded = new Set(detail.excluded_sections || []);
    for (const o of detail.objectives) {
      if (excluded.has(o.section_idx)) continue;
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
  const allCurricula = listAdoptedCurricula();
  for (const c of allCurricula) {
    const records = standardsRecordsForCurriculum(c.id);
    const rec = records.find((r) => r.code === code);
    if (rec) {
      return { curriculum_id: c.id, curriculum: c, record: rec };
    }
  }
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
  for (const { assignment: a, detail } of assignmentsWithDetailsForStats()) {
    if (!assignmentUsesCurriculum(detail, a, curriculumId)) continue;
    const excluded = new Set(detail.excluded_sections || []);
    const ref = { id: a.id, name: a.name, stem: a.stem };
    for (const o of detail.objectives) {
      if (excluded.has(o.section_idx)) continue;
      for (const al of o.alignments || []) {
        if (!al || !al.code) continue;
        if (!map[al.code]) map[al.code] = [];
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
  const records = standardsRecordsForCurriculum(curriculumId);
  if (!records || !records.length) return null;
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
  const rows = assignmentsWithDetailsForStats();
  for (const { assignment: a, detail } of rows) {
    bySubject[a.subject] = (bySubject[a.subject] || 0) + 1;
    totalObjectives += detail.n_total;
    alignedObjectives += detail.n_aligned;
    const excluded = new Set(detail.excluded_sections || []);
    for (const o of detail.objectives) {
      if (excluded.has(o.section_idx)) continue;
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
    edusperiences: rows.length,
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
  return assignmentsWithDetailsForStats().map(({ assignment: a, detail }) => {
    const distinctCodes = new Set();
    const excluded = new Set(detail.excluded_sections || []);
    for (const o of detail.objectives) {
      if (excluded.has(o.section_idx)) continue;
      for (const al of o.alignments || []) {
        if (al && al.code) distinctCodes.add(al.code);
      }
    }
    return {
      id: a.id,
      name: a.name,
      stem: a.stem,
      subject: a.subject,
      grade: a.grade,
      n_total: detail.n_total,
      n_aligned: detail.n_aligned,
      distinct_codes: distinctCodes.size,
      curriculum_id: detail.alignment_curriculum_id ?? a.curriculum_id,
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
    delete: (id) => wait(deleteAssignment(id)),
    restore: (row, index) => wait(restoreAssignment(row, index)),
    saveParsed: (id, parsed) => wait(saveParsedEdusperience(id, parsed)),
    getParsed: (id) => wait(getParsedEdusperience(id)),
    getAlignment: (id) => wait(getAlignment(id)),
    saveAlignment: (id, payload) => wait(saveAlignment(id, payload)),
    updateObjectiveAlignments: (id, payload) => wait(upsertObjectiveAlignments(id, payload)),
    setSectionIncluded: (id, sectionIdx, included) =>
      wait(setSectionIncluded(id, sectionIdx, included)),
    getExcludedSections: (id) => wait([...excludedSectionsForAssignment(id)]),
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
    recordsFor: (id) => wait(standardsRecordsForCurriculum(id)),
    recordsForCurricula: (ids) => wait(standardsRecordsForCurricula(ids)),
    saveForCurriculum: (id, records) =>
      wait(saveUserStandardsRecords(id, records)),
    usedBy: (id) => wait(standardsUsedBy(id)),
    summary: (id) => wait(standardsSummary(id)),
    usageMap: (id) => wait(standardsUsageMap(id)),
    findByCode: (code) => wait(findStandardByCode(code)),
    textByCode: (curriculumId) => wait(standardsTextByCode(curriculumId)),
    textByCodeForCurricula: (ids) => wait(standardsTextByCodeForCurricula(ids)),
  },
  settings: {
    // Implemented in settings.js — screens import from there directly.
  },
  review: {
    submitCurriculum: (payload) => wait(submitCurriculumForReview(payload)),
    listCurricula: () => wait(listCurriculumReviewQueue()),
  },
  dashboard: {
    summary: () => wait(dashboardSummary()),
    edusperiences: () => wait(dashboardEdusperiences()),
  },
  // Dev affordance: blow away localStorage and start over from seed.
  resetLocal: () => { storage.clearAll(); },
};
