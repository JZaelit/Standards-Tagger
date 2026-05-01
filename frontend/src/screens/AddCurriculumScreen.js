// Create / edit form for a curriculum.
//
//   navigation.navigate('AddCurriculum')                  -> create mode
//                                                            (search library, then upload)
//   navigation.navigate('AddCurriculum', { curriculum })  -> edit mode
//                                                            (skip search, pre-fill upload form)
//
// Edit mode is only valid for user-created curricula. Seed/library entries
// are read-only; the screen bounces back with an error toast if asked.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { dataClient } from '../lib/dataClient';
import { useToast } from '../components/Toast';
import { colors, typography } from '../theme';

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'text/plain',
];

export default function AddCurriculumScreen({ navigation, route }) {
  const editing = route?.params?.curriculum || null;
  const isEdit = !!editing && !editing.is_seed;

  // In edit mode jump straight to the form. In create mode start at search.
  const [step, setStep] = useState(isEdit ? 'form' : 'search');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // Form fields - pre-filled in edit mode.
  const [title, setTitle] = useState(editing?.title || '');
  const [grade, setGrade] = useState(editing?.grade || '');
  // file is the freshly-picked DocumentPicker asset, only set when the
  // user picks a new file. existingFileName preserves the prior filename
  // so edit mode can show "current: foo.pdf" without re-uploading.
  const [file, setFile] = useState(null);
  const [existingFileName, setExistingFileName] = useState(
    editing?.file_name || null,
  );
  const [isPublic, setIsPublic] = useState(
    editing ? editing.is_public !== false : true,
  );
  const [loading, setLoading] = useState(false);

  const toast = useToast();

  useEffect(() => {
    if (editing && editing.is_seed) {
      toast.show('Library curricula are read-only', { tone: 'danger' });
      navigation.goBack();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(false);
    const data = await dataClient.curricula.search(query);
    setSearchResults(data || []);
    setSearching(false);
    setSearched(true);
  };

  const handleAddFromLibrary = async (curriculum) => {
    await dataClient.curricula.addToUser(curriculum.id);
    toast.show(`Added "${curriculum.title}" to your list`, { tone: 'success' });
    navigation.goBack();
  };

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ACCEPTED_TYPES,
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets?.length > 0) {
      setFile(result.assets[0]);
      // Once a new file is picked, the prior filename is irrelevant.
      setExistingFileName(null);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !grade.trim()) return;
    setLoading(true);
    try {
      if (isEdit) {
        const updated = await dataClient.curricula.update(editing.id, {
          title: title.trim(),
          grade: grade.trim(),
          // Only overwrite file_name when the user picked a new file
          // (otherwise keep the existing filename intact).
          ...(file ? { file_name: file.name } : {}),
          is_public: isPublic,
        });
        if (!updated) throw new Error('Could not update curriculum.');
        setLoading(false);
        toast.show('Saved changes', { tone: 'success' });
        navigation.goBack();
      } else {
        await dataClient.curricula.create({
          title: title.trim(),
          grade: grade.trim(),
          file_name: file?.name || null,
          is_public: isPublic,
        });
        setLoading(false);
        toast.show('Curriculum added', { tone: 'success' });
        navigation.goBack();
      }
    } catch (e) {
      setLoading(false);
      toast.show(e.message || 'Could not save curriculum.', { tone: 'danger' });
    }
  };

  const submitLabel = isEdit ? 'Save Changes' : 'Save Curriculum';
  const screenTitle = isEdit ? 'Edit Curriculum' : 'Add Curriculum';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{screenTitle}</Text>
      </View>

      {step === 'search' && !isEdit ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Search the Library</Text>
          <Text style={styles.hint}>Find an existing curriculum before uploading a new one.</Text>

          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by title..."
              placeholderTextColor={colors.textLight}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
              {searching ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.searchButtonText}>Search</Text>
              )}
            </TouchableOpacity>
          </View>

          {searched && searchResults.length === 0 && (
            <Text style={styles.noResults}>No results found in the library.</Text>
          )}

          {searchResults.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={styles.resultRow}
              onPress={() => handleAddFromLibrary(c)}
            >
              <View style={styles.resultInfo}>
                <Text style={styles.resultTitle}>{c.title}</Text>
                <Text style={styles.resultGrade}>Grade {c.grade}</Text>
              </View>
              <Text style={styles.addText}>+ Add</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={styles.uploadInstead}
            onPress={() => setStep('form')}
          >
            <Text style={styles.uploadInsteadText}>
              {searched && searchResults.length === 0
                ? 'Upload new curriculum'
                : "Don't see it? Upload new curriculum"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          {!isEdit ? (
            <TouchableOpacity onPress={() => setStep('search')} style={styles.backToSearch}>
              <Text style={styles.back}>← Back to search</Text>
            </TouchableOpacity>
          ) : null}

          <Text style={styles.sectionTitle}>
            {isEdit ? 'Curriculum Details' : 'Upload New Curriculum'}
          </Text>

          <Text style={styles.label}>Curriculum Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. California Common Core Math"
            placeholderTextColor={colors.textLight}
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.label}>Grade *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 5th"
            placeholderTextColor={colors.textLight}
            value={grade}
            onChangeText={setGrade}
          />

          <Text style={styles.label}>Curriculum File</Text>
          <TouchableOpacity style={styles.filePicker} onPress={handlePickFile}>
            {file ? (
              <View style={styles.fileSelected}>
                <Text style={styles.fileIcon}>{getFileIcon(file.name)}</Text>
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                  <Text style={styles.fileSize}>{formatSize(file.size)}</Text>
                </View>
                <TouchableOpacity onPress={() => setFile(null)} style={styles.fileRemove}>
                  <Text style={styles.fileRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : existingFileName ? (
              <View style={styles.fileSelected}>
                <Text style={styles.fileIcon}>{getFileIcon(existingFileName)}</Text>
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {existingFileName}
                  </Text>
                  <Text style={styles.fileSize}>current file - tap to replace</Text>
                </View>
              </View>
            ) : (
              <View style={styles.fileEmpty}>
                <Text style={styles.fileUploadIcon}>↑</Text>
                <Text style={styles.filePrompt}>Click to upload file</Text>
                <Text style={styles.fileTypes}>PDF, DOCX, PPTX, or TXT</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setIsPublic(!isPublic)}
          >
            <View style={[styles.toggle, isPublic && styles.toggleOn]}>
              <View style={[styles.toggleThumb, isPublic && styles.toggleThumbOn]} />
            </View>
            <View style={styles.toggleLabel}>
              <Text style={styles.toggleTitle}>
                {isPublic ? 'Add to shared library' : 'Keep private'}
              </Text>
              <Text style={styles.toggleHint}>
                {isPublic
                  ? 'Other teachers can find and use this curriculum'
                  : 'Only visible to you'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, (!title.trim() || !grade.trim()) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading || !title.trim() || !grade.trim()}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{submitLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function getFileIcon(name = '') {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return '📄';
  if (ext === 'docx' || ext === 'doc') return '📝';
  if (ext === 'pptx' || ext === 'ppt') return '📊';
  return '📃';
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, maxWidth: 640, width: '100%', alignSelf: 'center' },
  header: { marginBottom: 20 },
  back: { color: colors.primary, fontWeight: '600', fontSize: 15, marginBottom: 10 },
  backToSearch: { marginBottom: 16 },
  title: { ...typography.heading },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: { ...typography.subheading, marginBottom: 4 },
  hint: { fontSize: 13, color: colors.textSecondary, marginBottom: 16 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  searchButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  searchButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  noResults: { color: colors.textLight, fontSize: 13, textAlign: 'center', marginVertical: 12 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: colors.background,
  },
  resultInfo: { flex: 1 },
  resultTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  resultGrade: { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 2 },
  addText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  uploadInstead: { marginTop: 16, alignItems: 'center' },
  uploadInsteadText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  label: { ...typography.label, marginBottom: 6, marginTop: 16 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  filePicker: {
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 10,
    overflow: 'hidden',
  },
  fileEmpty: { alignItems: 'center', paddingVertical: 28, gap: 6 },
  fileUploadIcon: { fontSize: 22, color: colors.textLight },
  filePrompt: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  fileTypes: { fontSize: 12, color: colors.textLight },
  fileSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    backgroundColor: colors.primaryLight,
  },
  fileIcon: { fontSize: 24 },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  fileSize: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  fileRemove: { padding: 4 },
  fileRemoveText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleOn: { backgroundColor: colors.primary },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.white,
  },
  toggleThumbOn: { alignSelf: 'flex-end' },
  toggleLabel: { flex: 1 },
  toggleTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  toggleHint: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
