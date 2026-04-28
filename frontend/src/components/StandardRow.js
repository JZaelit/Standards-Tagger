// One row in the standards browser. Subject-aware: ELA shows strand+subgroup,
// Math shows category/domain+cluster, History shows skill_category or course.
// Rendered as a memoised pure component because the FlatList scrolls thousands.

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { strandColor } from '../lib/strandColor';
import { colors } from '../theme';

function describeMeta(rec) {
  // Returns up to 3 short labels to render under the standard text.
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

function StandardRow({ rec, used }) {
  const color = strandColor(rec.code, null);
  return (
    <View style={[styles.row, used && styles.rowUsed]}>
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
      </View>
    </View>
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
    backgroundColor: colors.white,
    alignItems: 'flex-start',
  },
  rowUsed: {
    backgroundColor: colors.primaryLight,
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
});

export default memo(StandardRow);
