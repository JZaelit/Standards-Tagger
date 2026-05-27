// Pure filter/sort helpers for the EvalScreen toolbar. Kept out of the
// screen file so the JSX stays readable and the logic is easy to test.
//
// Default state shape lives here too (used both by EvalScreen and by the
// storage persistence layer so they don't drift).

import { previewText } from './htmlText';

export const ALL_SUBJECTS = ['ela', 'math', 'history'];

export const DEFAULT_EVAL_STATE = {
  density: 'cards', // 'cards' | 'compact'
  assignments: {
    search: '',
    sort: 'recent', // 'recent' | 'name' | 'aligned'
    subject: 'all', // 'all' | 'ela' | 'math' | 'history'
    grade: 'all',
    hideSamples: false,
    alignment: 'all', // 'all' | 'raw' | 'aligned'
  },
  curricula: {
    search: '',
    sort: 'recent', // 'recent' | 'name'
    hideLibrary: false,
  },
};

// Defensive merge: ensures any newly-added fields get their defaults even
// if older persisted state is missing them.
export function mergeEvalState(persisted) {
  const p = persisted || {};
  return {
    density: p.density === 'compact' ? 'compact' : 'cards',
    assignments: {
      search: typeof p.assignments?.search === 'string' ? p.assignments.search : '',
      sort: ['recent', 'name', 'aligned'].includes(p.assignments?.sort)
        ? p.assignments.sort
        : 'recent',
      subject: ['all', ...ALL_SUBJECTS].includes(p.assignments?.subject)
        ? p.assignments.subject
        : (Array.isArray(p.assignments?.subjects)
          && p.assignments.subjects.length === 1
          && ALL_SUBJECTS.includes(p.assignments.subjects[0])
            ? p.assignments.subjects[0]
            : 'all'),
      hideSamples: !!p.assignments?.hideSamples,
      alignment: ['all', 'raw', 'aligned'].includes(p.assignments?.alignment)
        ? p.assignments.alignment
        : 'all',
      grade: typeof p.assignments?.grade === 'string' ? p.assignments.grade : 'all',
    },
    curricula: {
      search: typeof p.curricula?.search === 'string' ? p.curricula.search : '',
      sort: ['recent', 'name'].includes(p.curricula?.sort)
        ? p.curricula.sort
        : 'recent',
      hideLibrary: !!p.curricula?.hideLibrary,
    },
  };
}

function toLower(s) {
  return (s || '').toString().toLowerCase();
}

// ---------- Assignments ----------

export function assignmentIsRaw(a) {
  if (!a || a.is_seed) return false;
  return !(a.n_aligned > 0);
}

export function assignmentIsAligned(a) {
  if (!a) return false;
  if (a.is_seed) return true;
  return a.n_aligned > 0;
}

export function filterAssignments(rows, state) {
  const { search, subject, hideSamples, alignment, grade } = state || {};
  let out = rows || [];
  if (hideSamples) {
    out = out.filter((a) => !a.is_seed);
  }
  if (alignment === 'raw') {
    out = out.filter((a) => assignmentIsRaw(a));
  } else if (alignment === 'aligned') {
    out = out.filter((a) => assignmentIsAligned(a));
  }
  if (grade && grade !== 'all') {
    out = out.filter((a) => String(a.grade || '').trim() === String(grade));
  }
  if (subject && subject !== 'all') {
    const allow = subject;
    out = out.filter((a) => {
      if (!a.subject) return true;
      const known = ALL_SUBJECTS.includes(a.subject);
      if (!known) return true;
      return a.subject === allow;
    });
  }
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    out = out.filter((a) => {
      const desc = previewText(a.description) || '';
      return (
        toLower(a.name).includes(q) ||
        toLower(a.grade).includes(q) ||
        toLower(desc).includes(q)
      );
    });
  }
  return out;
}

export function sortAssignments(rows, sort) {
  const out = [...(rows || [])];
  if (sort === 'name') {
    out.sort((a, b) => toLower(a.name).localeCompare(toLower(b.name)));
  } else if (sort === 'aligned') {
    const pct = (a) =>
      a.n_total > 0 ? a.n_aligned / a.n_total : 0;
    out.sort((a, b) => pct(b) - pct(a));
  } else {
    // 'recent' (default): seeds last because their created_at is in the
    // past; user-created on top by created_at desc.
    out.sort((a, b) => {
      const aSeed = !!a.is_seed;
      const bSeed = !!b.is_seed;
      if (aSeed !== bSeed) return aSeed ? 1 : -1;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
  }
  return out;
}

// ---------- Curricula ----------

export function filterCurricula(rows, state) {
  const { search, hideLibrary } = state || {};
  let out = rows || [];
  if (hideLibrary) {
    out = out.filter((c) => c.is_seed === false);
  }
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    out = out.filter(
      (c) =>
        toLower(c.title).includes(q) ||
        toLower(c.grade).includes(q) ||
        toLower(c.subject).includes(q),
    );
  }
  return out;
}

export function sortCurricula(rows, sort) {
  const out = [...(rows || [])];
  if (sort === 'name') {
    out.sort((a, b) => toLower(a.title).localeCompare(toLower(b.title)));
  } else {
    // 'recent' (default): user-created first by created_at desc, library after.
    out.sort((a, b) => {
      const aSeed = a.is_seed !== false;
      const bSeed = b.is_seed !== false;
      if (aSeed !== bSeed) return aSeed ? 1 : -1;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
  }
  return out;
}

// ---------- Display helpers ----------

export const SUBJECT_LABEL = { ela: 'ELA', math: 'Math', history: 'History' };

export const SORT_LABEL = {
  recent: 'Recent',
  name: 'Name (A-Z)',
  aligned: 'Aligned %',
};

export const ALIGNMENT_LABEL = {
  all: 'All',
  raw: 'Raw',
  aligned: 'Aligned',
};

export function gradeOrderKey(g) {
  if (!g || g === 'all') return 999;
  const s = String(g);
  if (s === 'K') return 0;
  const start = s.split('-')[0];
  if (start === 'K') return 0;
  const n = parseInt(start, 10);
  return Number.isFinite(n) ? n : 998;
}

export function uniqueGrades(rows) {
  const grades = new Set();
  for (const row of rows || []) {
    const g = String(row?.grade || '').trim();
    if (g) grades.add(g);
  }
  return [...grades].sort((a, b) => gradeOrderKey(a) - gradeOrderKey(b));
}
