// Create / edit form for an assignment (EduSperience).
//
// Upload is decoupled from alignment: attach JSON (primary), PDF, or DOCX;
// JSON parses locally; documents use Gemini when a key is set.

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
import { ingestEdusperienceUpload, isJsonUpload } from '../lib/parseUpload';
import { useToast } from '../components/Toast';
import TopNav from '../components/TopNav';
import SubjectPicker from '../components/SubjectPicker';
import FilePicker, { ACCEPTED_EDUSPERIENCE_TYPES } from '../components/FilePicker';
import { colors, typography } from '../theme';

export default function AddAssignmentScreen({ navigation, route }) {
  const editing = route?.params?.assignment || null;
  const isEdit = !!editing && !editing.is_seed;

  const [name, setName] = useState(editing?.name || '');
  const [grade, setGrade] = useState(editing?.grade || '');
  const [description, setDescription] = useState(editing?.description || '');
  const [subject, setSubject] = useState(editing?.subject || '');
  const [file, setFile] = useState(null);
  const [existingFileName, setExistingFileName] = useState(
    editing?.file_name || null,
  );
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const toast = useToast();

  useEffect(() => {
    if (editing && editing.is_seed) {
      toast.show('Sample assignments are read-only', { tone: 'danger' });
      navigation.goBack();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilePicked = (asset) => {
    setFile(asset);
    setExistingFileName(null);
  };

  const handleFileClear = () => {
    setFile(null);
    setExistingFileName(null);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !grade.trim()) return;
    if (!isEdit && !file) {
      setError('Attach a JSON, PDF, or DOCX EduSperience file.');
      return;
    }

    setError('');
    setLoading(true);
    setStatus('Saving…');

    try {
      let assignmentId = editing?.id;
      const payloadFileName = file?.name ?? existingFileName ?? null;

      if (isEdit) {
        const updated = await dataClient.assignments.update(editing.id, {
          name: name.trim(),
          grade: grade.trim(),
          description: description.trim(),
          subject: subject || null,
          file_name: payloadFileName,
        });
        if (!updated) throw new Error('Could not update assignment.');
        assignmentId = updated.id;
      } else {
        const created = await dataClient.assignments.create({
          name: name.trim(),
          grade: grade.trim(),
          description: description.trim(),
          subject: subject || null,
          file_name: payloadFileName,
        });
        assignmentId = created.id;
      }

      if (file) {
        setStatus(
          isJsonUpload(file.name, file.mimeType)
            ? 'Parsing JSON…'
            : 'Parsing document with Gemini…',
        );
        const { raw, normalized } = await ingestEdusperienceUpload({
          file,
          entityId: assignmentId,
        });
        await dataClient.assignments.saveParsed(assignmentId, {
          ...normalized,
          sections: raw.sections || [],
        });

        await dataClient.assignments.update(assignmentId, {
          name: (raw.title || name).trim(),
          grade: (raw.grade || grade).trim(),
          subject: raw.subject || subject || null,
          description: (raw.description || description).trim(),
          file_name: payloadFileName,
        });

        const objCount = normalized.objectives?.length ?? 0;
        setLoading(false);
        setStatus('');
        toast.show(`Saved — ${objCount} objectives extracted`, { tone: 'success' });
      } else {
        setLoading(false);
        setStatus('');
        toast.show('Saved changes', { tone: 'success' });
      }

      navigation.goBack();
    } catch (e) {
      setLoading(false);
      setStatus('');
      setError(e.message || 'Could not save assignment.');
    }
  };

  const submitLabel = isEdit ? 'Save Changes' : 'Upload EduSperience';

  return (
    <View style={styles.container}>
      <TopNav navigation={navigation} currentRoute="AddAssignment" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>
            {isEdit ? 'Edit Assignment' : 'Upload EduSperience'}
          </Text>
          <Text style={styles.hint}>
            Upload only — pick standards and run the tagger later on the Align tab.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>EduSperience document *</Text>
          <FilePicker
            file={file}
            existingFileName={existingFileName}
            onPick={handleFilePicked}
            onClear={handleFileClear}
            accept={ACCEPTED_EDUSPERIENCE_TYPES}
            hintLabel="JSON, PDF, or DOCX"
            placeholderNote="JSON parses instantly on this device. PDF/DOCX use Gemini when you add an API key."
          />

          <Text style={styles.label}>Display name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Filled from document when possible"
            placeholderTextColor={colors.textLight}
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Grade *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 9-10"
            placeholderTextColor={colors.textLight}
            value={grade}
            onChangeText={setGrade}
          />

          <Text style={styles.label}>Subject</Text>
          <SubjectPicker value={subject} onChange={setSubject} />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Optional summary"
            placeholderTextColor={colors.textLight}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {status ? (
            <View style={styles.statusRow}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.statusText}>{status}</Text>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[
              styles.button,
              (!name.trim() || !grade.trim() || loading) && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={loading || !name.trim() || !grade.trim()}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{submitLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: 24,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  header: { marginBottom: 20 },
  back: { color: colors.primary, fontWeight: '600', fontSize: 15, marginBottom: 10 },
  title: { ...typography.heading },
  hint: { fontSize: 13, color: colors.textSecondary, marginTop: 6, lineHeight: 19 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
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
  textarea: { minHeight: 80, paddingTop: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  statusText: { fontSize: 13, color: colors.textSecondary },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 28,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  error: { color: colors.danger, fontSize: 13, marginTop: 12, textAlign: 'center' },
});
