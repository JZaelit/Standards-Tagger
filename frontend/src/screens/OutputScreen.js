import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, typography, shadows } from '../theme';

export default function OutputScreen({ route, navigation }) {
  const { assignment } = route.params || {};
  const [curriculum, setCurriculum] = useState(null);
  const [loading, setLoading] = useState(true);

  // Placeholder — will be populated by AI tagger later
  const taggedStandards = [];

  useEffect(() => {
    const fetchCurriculum = async () => {
      if (!assignment?.curriculum_id) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('curriculum')
        .select('*')
        .eq('id', assignment.curriculum_id)
        .single();
      setCurriculum(data || null);
      setLoading(false);
    };
    fetchCurriculum();
  }, [assignment]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{assignment?.name || 'Output'}</Text>
        <Text style={styles.subtitle}>Grade {assignment?.grade}</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* Curriculum Box */}
          <View style={styles.box}>
            <Text style={styles.sectionLabel}>Curriculum</Text>
            {curriculum ? (
              <>
                <Text style={styles.curriculumTitle}>{curriculum.title}</Text>
                <Text style={styles.curriculumGrade}>Grade {curriculum.grade}</Text>
              </>
            ) : (
              <Text style={styles.empty}>No curriculum linked to this assignment.</Text>
            )}
          </View>

          {/* Tagged Standards */}
          <View style={styles.box}>
            <Text style={styles.sectionLabel}>Tagged Standards</Text>
            {taggedStandards.length === 0 ? (
              <View style={styles.emptyStandards}>
                <Text style={styles.empty}>No standards tagged yet.</Text>
                <Text style={styles.emptyHint}>Standards will appear here after the AI tagger runs.</Text>
              </View>
            ) : (
              taggedStandards.map((s, i) => (
                <View key={i} style={styles.standardRow}>
                  <View style={styles.standardBadge}>
                    <Text style={styles.standardCode}>{s.code}</Text>
                  </View>
                  <Text style={styles.standardDesc}>{s.description}</Text>
                </View>
              ))
            )}
          </View>

          {/* Assignment Text */}
          <View style={styles.box}>
            <Text style={styles.sectionLabel}>Assignment</Text>
            <TextInput
              style={styles.textarea}
              value={assignment?.description || ''}
              placeholder="Assignment description will appear here..."
              placeholderTextColor={colors.textLight}
              multiline
              editable={false}
              textAlignVertical="top"
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 24,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
    gap: 16,
  },
  header: {
    marginBottom: 8,
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
  subtitle: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  sectionLabel: {
    ...typography.label,
    marginBottom: 12,
  },
  box: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  curriculumTitle: {
    ...typography.subheading,
    fontSize: 18,
  },
  curriculumGrade: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  emptyStandards: {
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  empty: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  emptyHint: {
    color: colors.textLight,
    fontSize: 12,
    textAlign: 'center',
  },
  standardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  standardBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  standardCode: {
    color: colors.primaryDark,
    fontWeight: '700',
    fontSize: 12,
  },
  standardDesc: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  textarea: {
    minHeight: 220,
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
  },
});
