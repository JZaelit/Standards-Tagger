// CompareScreen — pick a curriculum and an edusperience, then view how
// the edusperience's objectives align to that curriculum's standards.
//
// navigation.navigate('Compare') from TopNav

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { dataClient } from '../lib/dataClient';
import { colors, shadows, typography } from '../theme';
import TopNav from '../components/TopNav';

const SUBJECT_LABEL = {
  ela: 'ELA',
  math: 'Math',
  history: 'History',
  science: 'Science',
};

function SectionHeader({ step, title, subtitle }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepNum}>{step}</Text>
      </View>
      <View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function SelectCard({ title, subtitle, badge, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.cardRow}>
        <View style={styles.cardText}>
          <Text style={[styles.cardTitle, selected && styles.cardTitleSelected]} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.cardSub} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>
        {badge ? (
          <View style={[styles.badge, selected && styles.badgeSelected]}>
            <Text style={[styles.badgeText, selected && styles.badgeTextSelected]}>{badge}</Text>
          </View>
        ) : null}
        {selected ? <Text style={styles.checkmark}>✓</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export default function CompareScreen({ navigation }) {
  const [curricula, setCurricula] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedCurriculum, setSelectedCurriculum] = useState(null);
  const [selectedAssignment, setSelectedAssignment] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [currs, asgns] = await Promise.all([
        dataClient.curricula.listLibrary(),
        dataClient.assignments.list(),
      ]);
      if (cancelled) return;
      setCurricula(currs || []);
      setAssignments(asgns || []);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Filter edusperiences to match selected curriculum's subject, if any.
  const filteredAssignments = selectedCurriculum
    ? assignments.filter(
        (a) =>
          !selectedCurriculum.subject ||
          !a.subject ||
          a.subject === selectedCurriculum.subject,
      )
    : assignments;

  const canCompare = selectedCurriculum && selectedAssignment;

  const handleCompare = () => {
    if (!canCompare) return;
    // Pass both the assignment and the chosen curriculum to OutputScreen.
    // OutputScreen loads detail via dataClient.assignments.detail which
    // returns the pre-computed alignment; the curriculum provides context
    // for the curriculum column and standards navigation.
    navigation.navigate('Output', {
      assignment: {
        ...selectedAssignment,
        curriculum_id: selectedCurriculum.id,
      },
      compareCurriculum: selectedCurriculum,
    });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <TopNav navigation={navigation} currentRoute="Compare" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TopNav navigation={navigation} currentRoute="Compare" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Compare</Text>
          <Text style={styles.pageSubtitle}>
            Select a curriculum and an edusperience to see how its objectives align to those standards.
          </Text>
        </View>

        {/* Step 1 — Curriculum */}
        <View style={styles.section}>
          <SectionHeader
            step="1"
            title="Choose a Curriculum"
            subtitle={selectedCurriculum ? selectedCurriculum.title : 'Select the standards database to compare against'}
          />
          <View style={styles.grid}>
            {curricula.map((c) => (
              <SelectCard
                key={c.id}
                title={c.title}
                subtitle={`Grade ${c.grade}`}
                badge={c.subject ? SUBJECT_LABEL[c.subject] || c.subject : null}
                selected={selectedCurriculum?.id === c.id}
                onPress={() => {
                  setSelectedCurriculum(c);
                  // Clear assignment selection if it no longer matches new subject filter.
                  if (
                    selectedAssignment &&
                    c.subject &&
                    selectedAssignment.subject &&
                    selectedAssignment.subject !== c.subject
                  ) {
                    setSelectedAssignment(null);
                  }
                }}
              />
            ))}
          </View>
        </View>

        {/* Step 2 — Edusperience */}
        <View style={styles.section}>
          <SectionHeader
            step="2"
            title="Choose an Edusperience"
            subtitle={
              selectedAssignment
                ? selectedAssignment.name
                : selectedCurriculum?.subject
                ? `Showing ${SUBJECT_LABEL[selectedCurriculum.subject] || selectedCurriculum.subject} assignments`
                : 'Select an edusperience to align'
            }
          />
          {filteredAssignments.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No edusperiences match this curriculum's subject.</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {filteredAssignments.map((a) => (
                <SelectCard
                  key={a.id}
                  title={a.name}
                  subtitle={`Grade ${a.grade || '—'}`}
                  badge={a.subject ? SUBJECT_LABEL[a.subject] || a.subject : null}
                  selected={selectedAssignment?.id === a.id}
                  onPress={() => setSelectedAssignment(a)}
                />
              ))}
            </View>
          )}
        </View>

        {/* Compare button */}
        <View style={styles.footer}>
          {selectedCurriculum && selectedAssignment ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>
                {selectedAssignment.name}
                <Text style={styles.summaryVs}> vs </Text>
                {selectedCurriculum.title}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.compareBtn, !canCompare && styles.compareBtnDisabled]}
            onPress={handleCompare}
            disabled={!canCompare}
          >
            <Text style={styles.compareBtnText}>View Alignment</Text>
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 24,
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
    gap: 28,
    paddingBottom: 48,
  },
  pageHeader: {
    gap: 6,
  },
  pageTitle: {
    ...typography.heading,
  },
  pageSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  section: {
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNum: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 14,
    minWidth: 200,
    maxWidth: 280,
    flex: 1,
    ...shadows.card,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardText: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cardTitleSelected: {
    color: colors.primaryDark,
  },
  cardSub: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  badge: {
    backgroundColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeSelected: {
    backgroundColor: colors.primary,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  badgeTextSelected: {
    color: '#fff',
  },
  checkmark: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 16,
    marginTop: 1,
  },
  empty: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  footer: {
    gap: 12,
    alignItems: 'center',
    paddingTop: 8,
  },
  summaryRow: {
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  summaryText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
  },
  summaryVs: {
    color: colors.textSecondary,
    fontWeight: '400',
  },
  compareBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: 'center',
    minWidth: 200,
  },
  compareBtnDisabled: {
    opacity: 0.4,
  },
  compareBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
