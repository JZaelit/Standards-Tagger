// One alignment chip: code badge, confidence badge, rationale, expandable
// "View in Source" panel showing the specific lesson excerpt for this standard.

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { strandColor, confidenceColors } from '../lib/strandColor';
import { colors, shadows } from '../theme';

export default function StandardChip({
  alignment,
  showText = true,
  objectiveContext,
  sourceExcerpt = '',
  onJumpToSource,
  onOpenInCurriculum,
}) {
  const [expanded, setExpanded] = useState(false);
  const a = alignment || {};
  const ctx = objectiveContext || {};
  const codeColor = strandColor(a.code, a.badge || a.strand);
  const conf = confidenceColors(a.confidence);
  const badgeText = a.badge || a.strand;
  const canExpand = !!(onJumpToSource && (sourceExcerpt || ctx.title || ctx.path));

  const CodeWrapper = onOpenInCurriculum ? TouchableOpacity : View;
  const codeProps = onOpenInCurriculum
    ? {
        onPress: onOpenInCurriculum,
        accessibilityRole: 'link',
        accessibilityLabel: `Open ${a.code} in its curriculum`,
        ...(Platform.OS === 'web'
          ? { onPressIn: (e) => e?.stopPropagation && e.stopPropagation() }
          : {}),
        style: [styles.code, styles.codeLinked, { color: codeColor }],
      }
    : { style: [styles.code, { color: codeColor }] };

  return (
    <View style={styles.chip}>
      <View style={styles.topRow}>
        <CodeWrapper {...codeProps}>
          <Text
            style={[
              styles.codeText,
              { color: codeColor },
              onOpenInCurriculum && styles.codeTextLinked,
            ]}
          >
            {a.code}
          </Text>
        </CodeWrapper>

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

      {canExpand ? (
        <>
          <TouchableOpacity
            style={styles.expandBtn}
            onPress={() => setExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
          >
            <Text style={styles.expandBtnText}>
              {expanded ? 'Hide Source Match' : 'View in Source'}
            </Text>
            <Text style={styles.expandChevron}>
              {expanded ? '\u25B2' : '\u25BC'}
            </Text>
          </TouchableOpacity>

          {expanded ? (
            <View style={styles.expandPanel}>
              <Text style={styles.expandSectionLabel}>
                Where in the lesson
              </Text>
              {ctx.sectionTitle ? (
                <Text style={styles.expandMeta}>
                  {`Section: ${ctx.sectionTitle}`}
                </Text>
              ) : null}
              {sourceExcerpt ? (
                <Text style={styles.expandExcerpt}>{sourceExcerpt}</Text>
              ) : null}
              {ctx.path ? (
                <Text style={styles.expandPath}>{ctx.path}</Text>
              ) : null}

              <TouchableOpacity
                style={styles.jumpBtn}
                onPress={() => {
                  onJumpToSource();
                  setExpanded(false);
                }}
              >
                <Text style={styles.jumpBtnText}>
                  Highlight in Source Panel
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      ) : null}
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
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#eef1f6',
  },
  codeLinked: {
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
  },
  codeText: {
    fontFamily: 'Menlo',
    fontSize: 13,
    fontWeight: '700',
  },
  codeTextLinked: {
    textDecorationLine: 'underline',
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  expandBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  expandChevron: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  expandPanel: {
    marginTop: 8,
    padding: 12,
    borderRadius: 6,
    borderLeftWidth: 4,
    borderLeftColor: colors.border,
    backgroundColor: colors.background,
    gap: 4,
  },
  expandSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.textSecondary,
  },
  expandMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  expandExcerpt: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 19,
    fontWeight: '600',
  },
  expandPath: {
    fontSize: 10,
    color: colors.textLight,
    fontFamily: 'Menlo',
    marginTop: 4,
  },
  jumpBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  jumpBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
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
