// Create / edit form for an assignment.
//
//   navigation.navigate('AddAssignment')                  -> create mode
//   navigation.navigate('AddAssignment', { assignment })  -> edit mode
//
// Edit mode pre-fills fields from `route.params.assignment` and calls
// dataClient.assignments.update on save. Seed assignments cannot be edited
// (the dataClient refuses to touch them); the screen guards against this
// by returning the user to the previous screen with an error toast.

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
import { colors, typography } from '../theme';

export default function AddAssignmentScreen({ navigation, route }) {
  const editing = route?.params?.assignment || null;
  const isEdit = !!editing && !editing.is_seed;

  const [name, setName] = useState(editing?.name || '');
  const [grade, setGrade] = useState(editing?.grade || '');
  const [description, setDescription] = useState(editing?.description || '');
  const [curricula, setCurricula] = useState([]);
  const [selectedCurriculum, setSelectedCurriculum] = useState(
    editing?.curriculum_id || null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetchingCurricula, setFetchingCurricula] = useState(true);

  const toast = useToast();

  useEffect(() => {
    // Guard: a seed assignment can't be edited; bounce back with a toast.
    if (editing && editing.is_seed) {
      toast.show('Seed assignments are read-only', { tone: 'danger' });
      navigation.goBack();
      return;
    }
    const fetchCurricula = async () => {
      const data = await dataClient.curricula.listForUser();
      setCurricula(data || []);
      setFetchingCurricula(false);
    };
    fetchCurricula();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (!name.trim() || !grade.trim()) return;
    setError('');
    setLoading(true);
    try {
      if (isEdit) {
        const updated = await dataClient.assignments.update(editing.id, {
          name: name.trim(),
          grade: grade.trim(),
          description: description.trim(),
          curriculum_id: selectedCurriculum,
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
          curriculum_id: selectedCurriculum,
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

        <Text style={styles.label}>Link to Curriculum</Text>
        {fetchingCurricula ? (
          <ActivityIndicator color={colors.primary} />
        ) : curricula.length === 0 ? (
          <Text style={styles.hint}>No curricula yet — add one first.</Text>
        ) : (
          <View style={styles.curriculumList}>
            {curricula.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.curriculumOption,
                  selectedCurriculum === c.id && styles.curriculumOptionSelected,
                ]}
                onPress={() =>
                  setSelectedCurriculum(selectedCurriculum === c.id ? null : c.id)
                }
              >
                <Text
                  style={[
                    styles.curriculumOptionText,
                    selectedCurriculum === c.id && styles.curriculumOptionTextSelected,
                  ]}
                >
                  {c.title} — Grade {c.grade}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

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
  hint: {
    color: colors.textLight,
    fontSize: 13,
    marginTop: 6,
  },
  curriculumList: {
    gap: 8,
    marginTop: 4,
  },
  curriculumOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.background,
  },
  curriculumOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  curriculumOptionText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  curriculumOptionTextSelected: {
    color: colors.primaryDark,
    fontWeight: '600',
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
