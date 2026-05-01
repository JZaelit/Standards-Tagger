// File-attachment picker shared by AddAssignment and AddCurriculum.
//
// Placeholder semantics: we don't actually upload or parse the file in
// this phase - we only capture its name so the form can show "current:
// foo.pdf" and the saved row can carry a file_name string for later
// reference. When a real backend lands, the picked file's local URI
// (file.uri) is what the upload would post.
//
//   <FilePicker
//     file={pickedFile}                 // the freshly-picked DocumentPicker asset
//     existingFileName={savedFileName}  // the prior file_name (edit mode)
//     onPick={setFile}
//     onClear={() => setFile(null)}
//     accept={ACCEPTED_TYPES}
//     hintLabel="PDF, DOCX, PPTX, or TXT"
//   />

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { colors } from '../theme';

export const ACCEPTED_DOC_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/plain',
];

const DEFAULT_HINT = 'PDF, DOCX, PPTX, XLSX, or TXT';

export function getFileIcon(name = '') {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return '📄';
  if (ext === 'docx' || ext === 'doc') return '📝';
  if (ext === 'pptx' || ext === 'ppt') return '📊';
  if (ext === 'xlsx' || ext === 'xls') return '📈';
  return '📃';
}

export function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilePicker({
  file,
  existingFileName,
  onPick,
  onClear,
  accept = ACCEPTED_DOC_TYPES,
  hintLabel = DEFAULT_HINT,
}) {
  const handlePick = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: accept,
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets?.length > 0) {
      onPick && onPick(result.assets[0]);
    }
  };

  return (
    <TouchableOpacity style={styles.picker} onPress={handlePick} activeOpacity={0.85}>
      {file ? (
        <View style={styles.selected}>
          <Text style={styles.icon}>{getFileIcon(file.name)}</Text>
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>{file.name}</Text>
            <Text style={styles.size}>{formatFileSize(file.size)}</Text>
          </View>
          {onClear ? (
            <TouchableOpacity onPress={onClear} style={styles.remove} hitSlop={10}>
              <Text style={styles.removeText}>{'\u2715'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : existingFileName ? (
        <View style={styles.selected}>
          <Text style={styles.icon}>{getFileIcon(existingFileName)}</Text>
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>{existingFileName}</Text>
            <Text style={styles.size}>current file - tap to replace</Text>
          </View>
          {onClear ? (
            <TouchableOpacity onPress={onClear} style={styles.remove} hitSlop={10}>
              <Text style={styles.removeText}>{'\u2715'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.uploadIcon}>{'\u2191'}</Text>
          <Text style={styles.prompt}>Click to upload file</Text>
          <Text style={styles.types}>{hintLabel}</Text>
          <Text style={styles.placeholderNote}>
            File is stored as a placeholder; AI tagging runs once available.
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  picker: {
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 10,
    overflow: 'hidden',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 14,
    gap: 4,
  },
  uploadIcon: {
    fontSize: 22,
    color: colors.textLight,
    marginBottom: 2,
  },
  prompt: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  types: {
    fontSize: 12,
    color: colors.textLight,
  },
  placeholderNote: {
    fontSize: 11,
    color: colors.textLight,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 320,
  },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    backgroundColor: colors.primaryLight,
  },
  icon: {
    fontSize: 24,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  size: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  remove: {
    padding: 6,
  },
  removeText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
