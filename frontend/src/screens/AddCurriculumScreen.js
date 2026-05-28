// Create / edit form for a curriculum.
//
//   navigation.navigate('AddCurriculum')                  -> create mode
//                                                            (search library, then upload)
//   navigation.navigate('AddCurriculum', { curriculum })  -> edit mode
//                                                            (skip search, pre-fill upload form)
//
// Edit mode is only valid for user-created curricula. Seed/library entries
// are read-only; the screen bounces back with an error toast if asked.
//
// Uses the shared FilePicker and SubjectPicker so the affordances stay in
// sync with AddAssignmentScreen.

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
import { dataClient } from '../lib/dataClient';
import { ingestStandardsUpload, isJsonUpload } from '../lib/parseUpload';
import { useToast } from '../components/Toast';
import TopNav from '../components/TopNav';
import SubjectPicker from '../components/SubjectPicker';
import FilePicker, { ACCEPTED_STANDARDS_TYPES } from '../components/FilePicker';
import { colors, typography } from '../theme';

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
  const [subject, setSubject] = useState(editing?.subject || '');
  const [extraGrades, setExtraGrades] = useState((editing?.grade_tags || []).join(', '));
  const [extraSubjects, setExtraSubjects] = useState((editing?.subject_tags || []).join(', '));
  const [submitForReview, setSubmitForReview] = useState(!isEdit);
  const [file, setFile] = useState(null);
  const [existingFileName, setExistingFileName] = useState(
    editing?.file_name || null,
  );
  const [isPublic, setIsPublic] = useState(
    editing ? editing.is_public !== false : true,
  );
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

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

  const handleFilePicked = (asset) => {
    setFile(asset);
    setExistingFileName(null);
  };

  const handleFileClear = () => {
    setFile(null);
    setExistingFileName(null);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !grade.trim()) return;
    if (!isEdit && !file) {
      toast.show('Attach a JSON, PDF, or DOCX standards file.', { tone: 'danger' });
      return;
    }
    setLoading(true);
    setStatus('Saving…');
    const fileName = file?.name ?? existingFileName ?? null;
    const gradeTags = extraGrades
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const subjectTags = extraSubjects
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    try {
      let curriculumId = editing?.id;
      if (isEdit) {
        const updated = await dataClient.curricula.update(editing.id, {
          title: title.trim(),
          grade: grade.trim(),
          subject: subject || null,
          grade_tags: gradeTags,
          subject_tags: subjectTags,
          file_name: fileName,
          is_public: isPublic,
        });
        if (!updated) throw new Error('Could not update curriculum.');
        curriculumId = updated.id;
      } else {
        const created = await dataClient.curricula.create({
          title: title.trim(),
          grade: grade.trim(),
          subject: subject || null,
          grade_tags: gradeTags,
          subject_tags: subjectTags,
          file_name: fileName,
          is_public: isPublic,
        });
        curriculumId = created.id;
      }

      if (file) {
        setStatus(
          isJsonUpload(file.name, file.mimeType)
            ? 'Parsing JSON…'
            : 'Parsing document with Gemini…',
        );
        const { parsed } = await ingestStandardsUpload({ file, entityId: curriculumId });
        const records = parsed.records || [];
        await dataClient.standards.saveForCurriculum(curriculumId, records);
        await dataClient.curricula.update(curriculumId, {
          title: (parsed.title || title).trim(),
          grade: (parsed.grade || grade).trim(),
          subject: parsed.subject || subject || null,
          grade_tags: gradeTags,
          subject_tags: subjectTags,
          standards_count: records.length,
        });
        toast.show(`Saved — ${records.length} standards extracted`, { tone: 'success' });
      } else {
        toast.show('Saved changes', { tone: 'success' });
      }
      if (submitForReview) {
        await dataClient.review.submitCurriculum({
          curriculum_id: curriculumId,
          title: title.trim(),
          grade: grade.trim(),
          subject: subject || null,
          grade_tags: gradeTags,
          subject_tags: subjectTags,
          file_name: fileName,
        });
      }

      setLoading(false);
      setStatus('');
      navigation.goBack();
    } catch (e) {
      setLoading(false);
      setStatus('');
      toast.show(e.message || 'Could not save curriculum.', { tone: 'danger' });
    }
  };

  const submitLabel = isEdit ? 'Save Changes' : 'Save Curriculum';
  const screenTitle = isEdit ? 'Edit Curriculum' : 'Add Curriculum';

  return (
    <View style={styles.container}>
      <TopNav navigation={navigation} currentRoute="AddCurriculum" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{screenTitle}</Text>
        </View>

        {step === 'search' && !isEdit ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Search the Library</Text>
            <Text style={styles.hint}>
              Find an existing curriculum before uploading a new one.
            </Text>

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
              {isEdit ? 'Standards Details' : 'Upload Standards'}
            </Text>
            <Text style={styles.hint}>
              Upload JSON (instant parse), PDF, or DOCX. Gemini is only needed for
              documents, not .json files.
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

            <Text style={styles.label}>Subject</Text>
            <SubjectPicker value={subject} onChange={setSubject} />

            <Text style={styles.label}>Additional grades (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 8th, 9th, 10th"
              placeholderTextColor={colors.textLight}
              value={extraGrades}
              onChangeText={setExtraGrades}
            />

            <Text style={styles.label}>Additional subjects (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. science, engineering"
              placeholderTextColor={colors.textLight}
              value={extraSubjects}
              onChangeText={setExtraSubjects}
            />

            <Text style={styles.label}>Standards File *</Text>
            <FilePicker
              file={file}
              existingFileName={existingFileName}
              onPick={handleFilePicked}
              onClear={handleFileClear}
              accept={ACCEPTED_STANDARDS_TYPES}
              hintLabel="JSON, PDF, or DOCX"
              placeholderNote="Use CA-ELA.json shape, or PDF/DOCX with a Gemini key."
            />

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
              style={styles.toggleRow}
              onPress={() => setSubmitForReview(!submitForReview)}
            >
              <View style={[styles.toggle, submitForReview && styles.toggleOn]}>
                <View style={[styles.toggleThumb, submitForReview && styles.toggleThumbOn]} />
              </View>
              <View style={styles.toggleLabel}>
                <Text style={styles.toggleTitle}>
                  {submitForReview ? 'Submit for dev review' : 'Skip dev review queue'}
                </Text>
                <Text style={styles.toggleHint}>
                  {submitForReview
                    ? "Don't see your curriculum? Submit here for database review/approval."
                    : 'This upload will only stay in your local library for now.'}
                </Text>
              </View>
            </TouchableOpacity>

            {status ? (
              <View style={styles.statusRow}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={styles.statusText}>{status}</Text>
              </View>
            ) : null}

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
    </View>
  );
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  statusText: { fontSize: 13, color: colors.textSecondary },
});
