// Header summary for the CurriculumDetailScreen standards browser:
//   "1,078 standards · 9 strands · K-12"
// Tappable strand chips with counts (acts as a strand filter), and
// tappable grade chips when the curriculum has multi-grade coverage.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { strandColor } from '../lib/strandColor';
import { colors, typography } from '../theme';

export default function StandardsSummary({
  summary,
  selectedStrand,
  onSelectStrand,
  selectedGrade,
  onSelectGrade,
}) {
  if (!summary) return null;
  const { total, strands, grades } = summary;
  const gradeSpan = grades && grades.length
    ? `${grades[0].grade} - ${grades[grades.length - 1].grade}`
    : '';

  return (
    <View style={styles.wrap}>
      <Text style={styles.headline}>
        {`${total.toLocaleString()} standards \u00b7 ${strands.length} strands` +
          (gradeSpan ? ` \u00b7 ${gradeSpan}` : '')}
      </Text>

      <Text style={styles.label}>Strand</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          <Chip
            label="All"
            selected={!selectedStrand}
            onPress={() => onSelectStrand && onSelectStrand(null)}
          />
          {strands.map((s) => {
            const color = strandColor(null, s.code);
            const active = selectedStrand === s.code;
            return (
              <Chip
                key={s.code}
                label={`${s.code} \u00b7 ${s.n}`}
                color={color}
                selected={active}
                onPress={() => onSelectStrand && onSelectStrand(active ? null : s.code)}
              />
            );
          })}
        </View>
      </ScrollView>

      <Text style={styles.label}>Grade</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          <Chip
            label="All"
            selected={!selectedGrade}
            onPress={() => onSelectGrade && onSelectGrade(null)}
          />
          {grades.map((g) => {
            const active = selectedGrade === g.grade;
            return (
              <Chip
                key={g.grade}
                label={`${g.grade} \u00b7 ${g.n}`}
                selected={active}
                onPress={() => onSelectGrade && onSelectGrade(active ? null : g.grade)}
              />
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function Chip({ label, color, selected, onPress }) {
  const accent = color || colors.textSecondary;
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        selected && {
          backgroundColor: color ? color : colors.primary,
          borderColor: color ? color : colors.primary,
        },
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.chipText,
          selected && styles.chipTextActive,
          !selected && color && { color: accent },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  headline: {
    ...typography.subheading,
    fontSize: 14,
    color: colors.textPrimary,
  },
  label: {
    ...typography.label,
    fontSize: 11,
    marginTop: 6,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
});
