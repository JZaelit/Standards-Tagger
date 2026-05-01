// Tiny localStorage wrapper used by the dataClient placeholder layer.
//
// On web (where localStorage is defined) values persist across refreshes.
// On native (where it isn't) reads return defaults and writes are no-ops, so
// the rest of the app keeps working off seed data.
//
// Keys are namespaced under `gradeflow:u:<userId>:` so two users signing
// into the same browser don't share data. setStorageUserId() is called
// from App.js when the Supabase session changes; until it's called, reads
// fall back to the legacy un-namespaced keys (back-compat for the
// placeholder phase).

const NS_BASE = 'gradeflow:';
const NS_USER_PREFIX = 'gradeflow:u:';

let currentUserId = null;
let legacyCleared = false;

function hasLocalStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch (e) {
    return false;
  }
}

function fullKey(key) {
  if (currentUserId) {
    return `${NS_USER_PREFIX}${currentUserId}:${key}`;
  }
  return `${NS_BASE}${key}`;
}

// Drop any pre-namespacing keys left over from earlier builds. We don't
// auto-migrate them into a user namespace because in the placeholder phase
// the legacy data was shared across users, so claiming it for whichever
// user signs in first would leak data. Better to start each per-user
// namespace fresh.
function clearLegacyKeys() {
  if (!hasLocalStorage() || legacyCleared) return;
  legacyCleared = true;
  try {
    const ls = window.localStorage;
    const drop = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(NS_BASE) && !k.startsWith(NS_USER_PREFIX)) {
        drop.push(k);
      }
    }
    drop.forEach((k) => ls.removeItem(k));
  } catch (e) { /* ignore */ }
}

// Called from App.js when the Supabase session changes.
//   - id  = userId string when signed in
//   - id  = null         when signed out
// Triggers a one-time clear of any legacy un-namespaced keys.
export function setStorageUserId(id) {
  currentUserId = id || null;
  if (currentUserId) clearLegacyKeys();
}

export function getStorageUserId() {
  return currentUserId;
}

export const storage = {
  get(key, fallback) {
    if (!hasLocalStorage()) return fallback;
    try {
      const raw = window.localStorage.getItem(fullKey(key));
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    if (!hasLocalStorage()) return;
    try {
      window.localStorage.setItem(fullKey(key), JSON.stringify(value));
    } catch (e) {
      // Quota errors etc. - silently ignore so the UI doesn't break.
    }
  },
  remove(key) {
    if (!hasLocalStorage()) return;
    try {
      window.localStorage.removeItem(fullKey(key));
    } catch (e) { /* ignore */ }
  },
  // Useful for "reset to seed" dev affordance.
  clearAll() {
    if (!hasLocalStorage()) return;
    try {
      const ls = window.localStorage;
      // Only clear the current user's namespace (or the anon fallback).
      const targetPrefix = currentUserId
        ? `${NS_USER_PREFIX}${currentUserId}:`
        : NS_BASE;
      const keys = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.startsWith(targetPrefix)) keys.push(k);
      }
      keys.forEach((k) => ls.removeItem(k));
    } catch (e) { /* ignore */ }
  },
};
