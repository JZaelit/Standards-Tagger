// One alignment chip: code badge (strand-colored), confidence badge, optional
// strand/category badge, optional grade + subgroup, "Why this maps" rationale,
// optional standard text. Mirrors the HTML dashboard's renderChip().
//
// Props:
//   alignment   { code, confidence, rationale, badge?, strand?, grade?,
//                 subgroup?, text?, modeling?, plus_standard? }
//   showText    boolean — show standard text block (default true)

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { strandColor, confidenceColors } from '../lib/strandColor';
import { colors, shadows } from '../theme';

export default function StandardChip({ alignment, showText = true }) {
  const a = alignment || {};
  const codeColor = strandColor(a.code, a.badge || a.strand);
  const conf = confidenceColors(a.confidence);
  const badgeText = a.badge || a.strand;

  return (
    <View style={styles.chip}>
      <View style={styles.topRow}>
        <Text style={[styles.code, { color: codeColor }]}>{a.code}</Text>

        {a.confidence ? (
          <View style={[styles.pill, { backgroundColor: conf.bg }]}>
            <Text style={[styles.pillText, { color: conf.fg }]}>
              {a.confidence}
            </Text>
          </View>
        ) : null}

        {badgeText ? (
          <View style={[styles.pill, { backgroundColor: codeColor }]}>
            <Text style={[styles.pillText, styles.pillTextLight]}>
              {badgeText}
            </Text>
          </View>
        ) : null}

        {a.grade ? (
          <Text style={styles.metaSmall}>Grade {a.grade}</Text>
        ) : null}

        {a.subgroup ? (
          <Text style={[styles.metaSmall, styles.italic]}>
            {'\u00b7 ' + a.subgroup}
          </Text>
        ) : null}

        {a.modeling ? (
          <Text style={styles.star}>{'\u2605 modeling'}</Text>
        ) : null}

        {a.plus_standard ? (
          <Text style={styles.star}>{'+ standard'}</Text>
        ) : null}
      </View>

      {showText && a.text ? (
        <View style={styles.stdText}>
          <Text style={styles.stdTextBody}>{a.text}</Text>
        </View>
      ) : null}

      <View style={styles.rationale}>
        <Text style={styles.rationaleLabel}>Why this maps</Text>
        <Text style={styles.rationaleBody}>{a.rationale || ''}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    ...shadows.card,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  code: {
    fontFamily: 'Menlo',
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#eef1f6',
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  pillTextLight: {
    color: '#fff',
    fontWeight: '600',
  },
  metaSmall: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  italic: {
    fontStyle: 'italic',
  },
  star: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '700',
  },
  stdText: {
    backgroundColor: colors.background,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  stdTextBody: {
    fontSize: 12,
    color: '#374151',
    lineHeight: 17,
  },
  rationale: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rationaleLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  rationaleBody: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 19,
  },
});
