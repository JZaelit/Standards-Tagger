import React, { useState } from 'react';
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
import { supabase } from '../lib/supabase';
import { colors, typography } from '../theme';

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'text/plain',
];

export default function AddCurriculumScreen({ navigation }) {
  const [step, setStep] = useState('search'); // 'search' | 'upload'
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // Upload form
  const [title, setTitle] = useState('');
  const [grade, setGrade] = useState('');
  const [file, setFile] = useState(null);
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(false);
    const { data } = await supabase
      .from('curriculum')
      .select('*')
      .eq('is_public', true)
      .ilike('title', `%${query.trim()}%`)
      .order('title', { ascending: true });
    setSearchResults(data || []);
    setSearching(false);
    setSearched(true);
  };

  const handleAddFromLibrary = async (curriculum) => {
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from('user_curriculum').insert({
      user_id: session.user.id,
      curriculum_id: curriculum.id,
    });
    // Duplicate just means they already have it — still navigate back
    if (!error || error.code === '23505') navigation.goBack();
  };

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ACCEPTED_TYPES,
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets?.length > 0) {
      setFile(result.assets[0]);
    }
  };

  const handleUpload = async () => {
    if (!title.trim() || !grade.trim()) return;
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const user = session.user;

    const { data: curr, error } = await supabase
      .from('curriculum')
      .insert({
        title: title.trim(),
        grade: grade.trim(),
        file_name: file?.name || null,
        is_public: isPublic,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (!error && curr) {
      await supabase.from('user_curriculum').insert({
        user_id: user.id,
        curriculum_id: curr.id,
      });
    }
    setLoading(false);
    if (!error) navigation.goBack();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Add Curriculum</Text>
      </View>

      {step === 'search' ? (
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
            onPress={() => setStep('upload')}
          >
            <Text style={styles.uploadInsteadText}>
              {searched && searchResults.length === 0
                ? "Upload new curriculum"
                : "Don't see it? Upload new curriculum"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <TouchableOpacity onPress={() => setStep('search')} style={styles.backToSearch}>
            <Text style={styles.back}>← Back to search</Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Upload New Curriculum</Text>

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
            ) : (
              <View style={styles.fileEmpty}>
                <Text style={styles.fileUploadIcon}>↑</Text>
                <Text style={styles.filePrompt}>Click to upload file</Text>
                <Text style={styles.fileTypes}>PDF, DOCX, PPTX, or TXT</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Privacy toggle */}
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
            onPress={handleUpload}
            disabled={loading || !title.trim() || !grade.trim()}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Save Curriculum</Text>
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
