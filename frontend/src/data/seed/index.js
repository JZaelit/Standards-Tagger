// Seed dataset for the GradeFlow placeholder phase.
//
// Imports the JSON artifacts produced by tools/sync_frontend_seed.py and
// stitches them into the shapes the React Native screens expect:
//
//   - SEED.assignments[]   one per *.final.json (used by EvalScreen list)
//   - SEED.curricula[]     three CA standards DBs as Curriculum entries
//   - SEED.assignmentDetail(stem)  rich nested record (sections/objectives/
//                                  alignments/source) for OutputScreen
//   - SEED.standardsByCurriculumId(id)  the underlying standards records
//
// Placeholder semantics:
//   - Every record has a stable id derived from the artifact stem so it
//     survives across page loads.
//   - The seeded user is presumed to have already adopted the ELA + Math
//     curricula (since that's what the seeded assignments use). History
//     stays in the public library only, demonstrating the AddCurriculum flow.
//   - Records carry uploaded_by: 'seed' / created_at: 0 to mark them as
//     non-user-created when we merge with localStorage entries.

import manifest from './manifest.json';

import mockingbirdFinal from './finals/mockingbird_essay.final.json';
import odysseyFinal from './finals/odyssey_essay.final.json';
import romeoFinal from './finals/romeo_essay.final.json';
import resumeFinal from './finals/resume.final.json';
import budgetFinal from './finals/budget.final.json';
import wwiiFinal from './finals/WWII_data.final.json';

import mockingbirdSource from './sources/mockingbird_essay.json';
import odysseySource from './sources/odyssey_essay.json';
import romeoSource from './sources/romeo_essay.json';
import resumeSource from './sources/resume.json';
import budgetSource from './sources/budget.json';
import wwiiSource from './sources/WWII_data.json';

import elaStandards from './standards/CA-ELA.json';
import mathStandards from './standards/CA-MATH.json';
import historyStandards from './standards/CA-HISTORY.json';

// ----- Index by stem -----
const FINAL_BY_STEM = {
  mockingbird_essay: mockingbirdFinal,
  odyssey_essay: odysseyFinal,
  romeo_essay: romeoFinal,
  resume: resumeFinal,
  budget: budgetFinal,
  WWII_data: wwiiFinal,
};

const SOURCE_BY_STEM = {
  mockingbird_essay: mockingbirdSource,
  odyssey_essay: odysseySource,
  romeo_essay: romeoSource,
  resume: resumeSource,
  budget: budgetSource,
  WWII_data: wwiiSource,
};

// ----- Curricula (the 3 CA standards DBs) -----

const STANDARDS_BY_DB = {
  'categorized-standards/California/CA-ELA.json': elaStandards,
  'categorized-standards/California/CA-MATH.json': mathStandards,
  'categorized-standards/California/CA-HISTORY.json': historyStandards,
};

function recordsOf(db) {
  if (!db) return [];
  if (Array.isArray(db)) return db;
  if (Array.isArray(db.records)) return db.records;
  return [];
}

export const SEED_CURRICULA = [
  {
    id: 'curr-ela',
    title: 'California Common Core ELA',
    grade: 'K-12',
    file_name: 'CA-ELA.json',
    is_public: true,
    uploaded_by: 'seed',
    created_at: '2024-01-01T00:00:00Z',
    standards_db: 'categorized-standards/California/CA-ELA.json',
    standards_count: recordsOf(elaStandards).length,
    subject: 'ela',
  },
  {
    id: 'curr-math',
    title: 'California Common Core Math',
    grade: 'K-12',
    file_name: 'CA-MATH.json',
    is_public: true,
    uploaded_by: 'seed',
    created_at: '2024-01-02T00:00:00Z',
    standards_db: 'categorized-standards/California/CA-MATH.json',
    standards_count: recordsOf(mathStandards).length,
    subject: 'math',
  },
  {
    id: 'curr-history',
    title: 'California HSS Framework',
    grade: 'K-12',
    file_name: 'CA-HISTORY.json',
    is_public: true,
    uploaded_by: 'seed',
    created_at: '2024-01-03T00:00:00Z',
    standards_db: 'categorized-standards/California/CA-HISTORY.json',
    standards_count: recordsOf(historyStandards).length,
    subject: 'history',
  },
];

const CURRICULUM_BY_ID = Object.fromEntries(SEED_CURRICULA.map((c) => [c.id, c]));
const CURRICULUM_BY_DB_PATH = Object.fromEntries(
  SEED_CURRICULA.map((c) => [c.standards_db, c])
);

// Default curriculum adoptions for any signed-in user who has no localStorage
// adoptions yet. ELA + Math are pre-adopted because that's what the seeded
// assignments reference; History stays in the public library only so the
// "+ Add Curriculum -> Search" flow has something interesting to find.
export const DEFAULT_ADOPTED_CURRICULUM_IDS = ['curr-ela', 'curr-math'];

// ----- Assignments (one per *.final.json) -----

function pickCurriculumForFinal(finalData) {
  const dbPath = finalData.standards_db;
  const c = CURRICULUM_BY_DB_PATH[dbPath];
  return c ? c.id : null;
}

function describeAssignment(finalData) {
  const sourceStem = (finalData.source_file || '').split('/').pop().replace(/\.json$/, '');
  const src = SOURCE_BY_STEM[sourceStem];
  if (src && src.description) {
    return src.description;
  }
  return finalData.notes || '';
}

// Collapse adjacent grade bands into a single span so cards read cleanly.
//   ['9-10', '11-12']  -> '9-12'
//   ['K-2',  '3-5']    -> 'K-5'
//   ['6-8']            -> '6-8'
//   ['K-12']           -> 'K-12'
function gradeOfAssignment(finalData) {
  const bands = finalData.inferred_grade_bands || [];
  if (!bands.length) return '';
  if (bands.length === 1) return bands[0];
  const first = bands[0];
  const last = bands[bands.length - 1];
  const firstStart = first.split('-')[0];
  const lastEnd = last.split('-').pop();
  if (firstStart && lastEnd && firstStart !== lastEnd) {
    return `${firstStart}-${lastEnd}`;
  }
  return bands.join(', ');
}

const SEED_ASSIGNMENTS = manifest.map((m, idx) => {
  const final = FINAL_BY_STEM[m.stem];
  const curriculumId = pickCurriculumForFinal(final);
  return {
    id: `seed-${m.stem}`,
    stem: m.stem,
    name: m.edusperience_title,
    grade: gradeOfAssignment(final),
    description: describeAssignment(final),
    curriculum_id: curriculumId,
    user_id: 'seed',
    created_at: `2024-01-${String(10 + idx).padStart(2, '0')}T00:00:00Z`,
    subject: m.subject,
    notes: m.notes,
    inferred_grade_bands: m.inferred_grade_bands,
    source_file: m.source_file,
    is_seed: true,
  };
});

const ASSIGNMENT_BY_ID = Object.fromEntries(SEED_ASSIGNMENTS.map((a) => [a.id, a]));

// ----- Detail accessors -----

function buildAssignmentDetail(stem) {
  const finalData = FINAL_BY_STEM[stem];
  if (!finalData) return null;
  const src = SOURCE_BY_STEM[stem] || null;
  const meta = manifest.find((m) => m.stem === stem) || {};
  const curriculum = pickCurriculumForFinal(finalData);
  const assignment = SEED_ASSIGNMENTS.find((a) => a.stem === stem);

  // Section titles aren't on .final.json - derive from source if available.
  const sectionTitleByIdx = (src && src.sections)
    ? src.sections.map((s, i) => s.title || `Section ${i + 1}`)
    : [];
  const sectionDescByIdx = (src && src.sections)
    ? src.sections.map((s) => s.description || '')
    : [];

  const objectives = (finalData.objectives || []).map((o) => {
    const m = /sections\[(\d+)\]\.objectives\[(\d+)\]/.exec(o.path || '');
    const sec = m ? parseInt(m[1], 10) : 0;
    const obj = m ? parseInt(m[2], 10) : 0;
    return {
      ...o,
      section_idx: sec,
      objective_idx: obj,
      section_title: sectionTitleByIdx[sec] || `Section ${sec + 1}`,
      section_description: sectionDescByIdx[sec] || '',
    };
  });

  const nAligned = objectives.filter((o) => (o.alignments || []).length > 0).length;
  const nTotal = objectives.length;

  return {
    ...assignment,
    subject: meta.subject || 'ela',
    standards_db: finalData.standards_db,
    curriculum_id: curriculum,
    source: src ? { path: meta.source_file, ...src } : null,
    objectives,
    n_total: nTotal,
    n_aligned: nAligned,
  };
}

const STANDARDS_RECORDS_BY_CURRICULUM_ID = {
  'curr-ela': recordsOf(elaStandards),
  'curr-math': recordsOf(mathStandards),
  'curr-history': recordsOf(historyStandards),
};

const STANDARDS_INDEX_BY_CURRICULUM_ID = {
  'curr-ela': Object.fromEntries(recordsOf(elaStandards).map((r) => [r.code, r])),
  'curr-math': Object.fromEntries(recordsOf(mathStandards).map((r) => [r.code, r])),
  'curr-history': Object.fromEntries(recordsOf(historyStandards).map((r) => [r.code, r])),
};

export const SEED = {
  assignments: SEED_ASSIGNMENTS,
  assignmentById: (id) => ASSIGNMENT_BY_ID[id] || null,
  assignmentDetail: (stem) => buildAssignmentDetail(stem),
  curricula: SEED_CURRICULA,
  curriculumById: (id) => CURRICULUM_BY_ID[id] || null,
  defaultAdoptedCurriculumIds: DEFAULT_ADOPTED_CURRICULUM_IDS,
  standardsRecordsByCurriculumId: STANDARDS_RECORDS_BY_CURRICULUM_ID,
  standardsIndexByCurriculumId: STANDARDS_INDEX_BY_CURRICULUM_ID,
};
