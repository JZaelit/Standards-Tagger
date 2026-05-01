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
    subjects: [...ALL_SUBJECTS], // empty array means none, full list means all
    hideSamples: false,
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
      subjects: Array.isArray(p.assignments?.subjects)
        ? p.assignments.subjects.filter((s) => ALL_SUBJECTS.includes(s))
        : [...ALL_SUBJECTS],
      hideSamples: !!p.assignments?.hideSamples,
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

export function filterAssignments(rows, state) {
  const { search, subjects, hideSamples } = state || {};
  let out = rows || [];
  if (hideSamples) {
    out = out.filter((a) => !a.is_seed);
  }
  if (subjects && subjects.length && subjects.length < ALL_SUBJECTS.length) {
    // User-created assignments often have no subject; treat them as
    // matching every filter so they don't disappear when filtering.
    const allow = new Set(subjects);
    out = out.filter((a) => !a.subject || allow.has(a.subject));
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
