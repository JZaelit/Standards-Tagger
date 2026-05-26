// Create / edit form for an assignment.
//
//   navigation.navigate('AddAssignment')                  -> create mode
//   navigation.navigate('AddAssignment', { assignment })  -> edit mode
//
// Edit mode pre-fills fields from `route.params.assignment` and calls
// dataClient.assignments.update on save. Seed assignments cannot be
// edited; the screen guards against this and bounces back with a toast.
//
// Adds a subject picker (ELA / Math / History / Other...) and an optional
// file attachment. The file is a placeholder for the AI tagger that lives
// in the next chunk - we capture name/size today so the row can show
// "current: foo.pdf" and the future pipeline knows what to fetch.

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
import { useToast } from '../components/Toast';
import TopNav from '../components/TopNav';
import SubjectPicker from '../components/SubjectPicker';
import FilePicker from '../components/FilePicker';
import { colors, typography } from '../theme';

export default function AddAssignmentScreen({ navigation, route }) {
  const editing = route?.params?.assignment || null;
  const isEdit = !!editing && !editing.is_seed;

  const [name, setName] = useState(editing?.name || '');
  const [grade, setGrade] = useState(editing?.grade || '');
  const [description, setDescription] = useState(editing?.description || '');
  const [subject, setSubject] = useState(editing?.subject || '');
  const [file, setFile] = useState(null);
  const [existingFileName, setExistingFileName] = useState(editing?.file_name || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toast = useToast();

  useEffect(() => {
    if (editing && editing.is_seed) {
      toast.show('Seed assignments are read-only', { tone: 'danger' });
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
    setError('');
    setLoading(true);
    const payloadFileName = file?.name || existingFileName || null;
    try {
      if (isEdit) {
        const updated = await dataClient.assignments.update(editing.id, {
          name: name.trim(),
          grade: grade.trim(),
          description: description.trim(),
          subject: subject || null,
          file_name: payloadFileName,
        });
        if (!updated) throw new Error('Could not update assignment.');
        setLoading(false);
        toast.show('Saved changes', { tone: 'success' });
        navigation.goBack();
      } else {
        await dataClient.assignments.create({
          name: name.trim(),
          grade: grade.trim(),
          description: description.trim(),
          subject: subject || null,
          file_name: payloadFileName,
        });
        setLoading(false);
        toast.show('Assignment created', { tone: 'success' });
        navigation.goBack();
      }
    } catch (e) {
      setLoading(false);
      setError(e.message || 'Could not save assignment.');
    }
  };

  const submitLabel = isEdit ? 'Save Changes' : 'Save Assignment';

  return (
    <View style={styles.container}>
      <TopNav navigation={navigation} currentRoute="AddAssignment" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>
            {isEdit ? 'Edit Assignment' : 'New Assignment'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Assignment Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Fraction Word Problems"
            placeholderTextColor={colors.textLight}
            value={name}
            onChangeText={setName}
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

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Describe the assignment..."
            placeholderTextColor={colors.textLight}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <Text style={styles.label}>Attachment (optional)</Text>
          <FilePicker
            file={file}
            existingFileName={existingFileName}
            onPick={handleFilePicked}
            onClear={handleFileClear}
            hintLabel="PDF, DOCX, PPTX, XLSX, or TXT"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, (!name.trim() || !grade.trim()) && styles.buttonDisabled]}
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 24,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    marginBottom: 20,
  },
  back: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 15,
    marginBottom: 10,
  },
  title: {
    ...typography.heading,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    ...typography.label,
    marginBottom: 6,
    marginTop: 16,
  },
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
  textarea: {
    minHeight: 100,
    paddingTop: 10,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 28,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
});
