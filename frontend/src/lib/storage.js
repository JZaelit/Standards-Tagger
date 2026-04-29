// Tiny localStorage wrapper used by the dataClient placeholder layer.
//
// On web (where localStorage is defined) values persist across refreshes.
// On native (where it isn't) reads return defaults and writes are no-ops, so
// the rest of the app keeps working off seed data.
//
// All keys are namespaced under `gradeflow:` to avoid collisions with anything
// else the host page might be using.

const NS = 'gradeflow:';

function hasLocalStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch (e) {
    return false;
  }
}

export const storage = {
  get(key, fallback) {
    if (!hasLocalStorage()) return fallback;
    try {
      const raw = window.localStorage.getItem(NS + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    if (!hasLocalStorage()) return;
    try {
      window.localStorage.setItem(NS + key, JSON.stringify(value));
    } catch (e) {
      // Quota errors etc. - silently ignore so the UI doesn't break.
    }
  },
  remove(key) {
    if (!hasLocalStorage()) return;
    try {
      window.localStorage.removeItem(NS + key);
    } catch (e) { /* ignore */ }
  },
  // Useful for "reset to seed" dev affordance.
  clearAll() {
    if (!hasLocalStorage()) return;
    try {
      const keys = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(NS)) keys.push(k);
      }
      keys.forEach((k) => window.localStorage.removeItem(k));
    } catch (e) { /* ignore */ }
  },
};
