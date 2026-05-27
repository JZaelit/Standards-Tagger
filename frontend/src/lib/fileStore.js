// Stores uploaded file bytes (base64) keyed by entity id so Gemini can
// re-read documents at parse/tag time without re-uploading.
//
// Kept separate from assignment/curriculum rows to avoid bloating list
// payloads. localStorage quota is ~5MB per origin — we refuse stores
// larger than 3.5MB and surface a friendly error.

import { storage } from './storage';

const KEY_FILES = 'file_store';
const MAX_BYTES = 3.5 * 1024 * 1024;

function allFiles() {
  return storage.get(KEY_FILES, {}) || {};
}

function saveAll(map) {
  storage.set(KEY_FILES, map);
}

export async function readPickerAssetAsBase64(asset) {
  if (!asset?.uri) throw new Error('No file selected.');
  const resp = await fetch(asset.uri);
  const blob = await resp.blob();
  if (blob.size > MAX_BYTES) {
    throw new Error(
      `File is ${(blob.size / (1024 * 1024)).toFixed(1)}MB — max ${(MAX_BYTES / (1024 * 1024)).toFixed(1)}MB for browser storage.`,
    );
  }
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);
  return {
    base64,
    mimeType: asset.mimeType || blob.type || 'application/octet-stream',
    name: asset.name || 'upload',
    size: blob.size,
  };
}

export async function readPickerAssetAsText(asset) {
  if (!asset?.uri) throw new Error('No file selected.');
  const resp = await fetch(asset.uri);
  const blob = await resp.blob();
  if (blob.size > MAX_BYTES) {
    throw new Error(
      `File is ${(blob.size / (1024 * 1024)).toFixed(1)}MB — max ${(MAX_BYTES / (1024 * 1024)).toFixed(1)}MB for browser storage.`,
    );
  }
  return blob.text();
}

export function isJsonUpload(name = '', mimeType = '') {
  const ext = (name || '').split('.').pop()?.toLowerCase();
  return ext === 'json' || mimeType === 'application/json';
}

function base64ToUtf8(base64) {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function readStoredFileAsText(entityId) {
  const f = getFile(entityId);
  if (!f?.base64) return null;
  return base64ToUtf8(f.base64);
}

export function storeFile(entityId, filePayload) {
  if (!entityId || !filePayload?.base64) return;
  const map = allFiles();
  map[entityId] = {
    base64: filePayload.base64,
    mimeType: filePayload.mimeType,
    name: filePayload.name,
    size: filePayload.size,
    stored_at: new Date().toISOString(),
  };
  saveAll(map);
}

export function getFile(entityId) {
  if (!entityId) return null;
  return allFiles()[entityId] || null;
}

export function removeFile(entityId) {
  if (!entityId) return;
  const map = allFiles();
  if (!map[entityId]) return;
  delete map[entityId];
  saveAll(map);
}

export function filePartForGemini(entityId) {
  const f = getFile(entityId);
  if (!f) return null;
  return {
    inlineData: {
      mimeType: f.mimeType,
      data: f.base64,
    },
  };
}
