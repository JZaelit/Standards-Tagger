// One row in the standards browser. Subject-aware: ELA shows strand+subgroup,
// Math shows category/domain+cluster, History shows skill_category or course.
//
// When the row's standard is referenced by one or more user assignments,
// renders an inline "Used in: [Assignment A], [Assignment B]" line with
// each assignment as a tappable link. The list is truncated at 3 with a
// "+N more" link that expands inline.
//
// Optionally renders a temporary highlight when the parent passes
// `highlight: true` (used for the focus-from-elsewhere navigation pattern).

import React, { memo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { strandColor } from '../lib/strandColor';
import { colors } from '../theme';

const MAX_INLINE_ASSIGNMENTS = 3;

function describeMeta(rec) {
  const parts = [];
  if (rec.grade || rec.grade_band) {
    parts.push(`Grade ${rec.grade || rec.grade_band}`);
  }
  if (rec.strand_name) parts.push(rec.strand_name);
  if (rec.category_name) parts.push(rec.category_name);
  if (rec.domain_name) parts.push(rec.domain_name);
  if (rec.cluster) parts.push(rec.cluster);
  if (rec.skill_category) parts.push(rec.skill_category);
  if (rec.course_title) parts.push(rec.course_title);
  if (rec.subgroup) parts.push(rec.subgroup);
  if (rec.is_anchor) parts.push('Anchor');
  if (rec.is_practice) parts.push('Practice');
  if (rec.modeling) parts.push('\u2605 modeling');
  if (rec.plus_standard) parts.push('+ standard');
  if (rec.ca_addition) parts.push('CA addition');
  return parts.slice(0, 3).join(' \u00b7 ');
}

function UsedInLine({ assignments, onOpenAssignment }) {
  const [expanded, setExpanded] = useState(false);
  if (!assignments || !assignments.length) return null;
  const visible = expanded
    ? assignments
    : assignments.slice(0, MAX_INLINE_ASSIGNMENTS);
  const hidden = assignments.length - visible.length;

  return (
    <View style={styles.usedInRow}>
      <Text style={styles.usedInLabel}>Used in</Text>
      <View style={styles.usedInLinks}>
        {visible.map((a, i) => (
          <React.Fragment key={a.id}>
            {i > 0 ? <Text style={styles.usedInSep}>{'\u00b7'}</Text> : null}
            <TouchableOpacity
              onPress={() => onOpenAssignment && onOpenAssignment(a)}
              accessibilityRole="link"
            >
              <Text style={styles.usedInLink} numberOfLines={1}>{a.name}</Text>
            </TouchableOpacity>
          </React.Fragment>
        ))}
        {hidden > 0 ? (
          <>
            <Text style={styles.usedInSep}>{'\u00b7'}</Text>
            <TouchableOpacity onPress={() => setExpanded(true)}>
              <Text style={styles.usedInMore}>{`+${hidden} more`}</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </View>
  );
}

function StandardRow({ rec, used, usedBy, onOpenAssignment, highlight, onLayout }) {
  const color = strandColor(rec.code, null);
  const flash = useRef(new Animated.Value(highlight ? 1 : 0)).current;

  useEffect(() => {
    if (!highlight) return;
    flash.setValue(1);
    Animated.sequence([
      Animated.delay(1200),
      Animated.timing(flash, { toValue: 0, duration: 700, useNativeDriver: false }),
    ]).start();
  }, [highlight, flash]);

  const bg = flash.interpolate({
    inputRange: [0, 1],
    outputRange: [used ? colors.primaryLight : colors.white, '#fef9c3'],
  });
  const borderColor = flash.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, '#eab308'],
  });

  const wrappedOpenAssignment = (a) => {
    if (onOpenAssignment) onOpenAssignment(a);
  };

  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        styles.row,
        { backgroundColor: bg, borderLeftWidth: 3, borderLeftColor: borderColor },
      ]}
    >
      <View style={styles.codeCell}>
        <View style={[styles.codePill, { backgroundColor: color }]}>
          <Text style={styles.codeText}>{rec.code}</Text>
        </View>
        {used ? <Text style={styles.usedTag}>Used</Text> : null}
      </View>
      <View style={styles.textCell}>
        <Text style={styles.text} numberOfLines={4}>
          {rec.text || '(no text)'}
        </Text>
        <Text style={styles.meta}>{describeMeta(rec)}</Text>
        {usedBy && usedBy.length > 0 ? (
          <UsedInLine
            assignments={usedBy}
            onOpenAssignment={wrappedOpenAssignment}
          />
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'flex-start',
  },
  codeCell: {
    width: 130,
    alignItems: 'flex-start',
    gap: 4,
  },
  codePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  codeText: {
    color: '#fff',
    fontFamily: 'Menlo',
    fontWeight: '700',
    fontSize: 12,
  },
  usedTag: {
    fontSize: 10,
    color: colors.primaryDark,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textCell: {
    flex: 1,
    minWidth: 0,
  },
  text: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  meta: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
  usedInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  usedInLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginRight: 4,
  },
  usedInLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  usedInLink: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
    textDecorationLine: 'underline',
  },
  usedInSep: {
    color: colors.textLight,
    fontSize: 12,
  },
  usedInMore: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});

export default memo(StandardRow);
