// One alignment chip: code badge (strand-colored), confidence badge, optional
// strand/category badge, optional grade + subgroup, "Why this maps" rationale,
// optional standard text. Mirrors the HTML dashboard's renderChip().
//
// Two click affordances:
//   - Tap the chip body to jump to where this objective lives in the source
//     (parent passes onJumpToSource).
//   - Tap the code badge specifically to open this code in its curriculum
//     (parent passes onOpenInCurriculum). The badge is the "what is this
//     code?" affordance; the chip body is the "where in this lesson?" one.
//
// Props:
//   alignment            { code, confidence, rationale, badge?, strand?,
//                          grade?, subgroup?, text?, modeling?, plus_standard? }
//   showText             show standard text block (default true)
//   onJumpToSource       optional: tap the chip body to jump to source
//   onOpenInCurriculum   optional: tap the code badge to open in curriculum

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { strandColor, confidenceColors } from '../lib/strandColor';
import { colors, shadows } from '../theme';

export default function StandardChip({
  alignment,
  showText = true,
  onJumpToSource,
  onOpenInCurriculum,
}) {
  const a = alignment || {};
  const codeColor = strandColor(a.code, a.badge || a.strand);
  const conf = confidenceColors(a.confidence);
  const badgeText = a.badge || a.strand;

  const ChipWrapper = onJumpToSource ? TouchableOpacity : View;
  const wrapperProps = onJumpToSource
    ? {
        onPress: onJumpToSource,
        activeOpacity: 0.85,
        accessibilityRole: 'button',
        accessibilityLabel: `Jump to ${a.code} in the source`,
      }
    : {};

  // The code badge is its own touchable so the cross-link to the curriculum
  // doesn't fire the chip-body's source-jump handler.
  const CodeWrapper = onOpenInCurriculum ? TouchableOpacity : View;
  const codeProps = onOpenInCurriculum
    ? {
        onPress: onOpenInCurriculum,
        accessibilityRole: 'link',
        accessibilityLabel: `Open ${a.code} in its curriculum`,
        // Stop the press from bubbling to the parent TouchableOpacity on web.
        // RN's onPress doesn't bubble on native, so this is safe noop there.
        ...(Platform.OS === 'web'
          ? { onPressIn: (e) => e?.stopPropagation && e.stopPropagation() }
          : {}),
        style: [styles.code, styles.codeLinked, { color: codeColor }],
      }
    : { style: [styles.code, { color: codeColor }] };

  return (
    <ChipWrapper style={[styles.chip, onJumpToSource && styles.chipClickable]} {...wrapperProps}>
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

      {onJumpToSource ? (
        <Text style={styles.jumpHint}>{'Tap chip to view in source \u2192'}</Text>
      ) : null}
    </ChipWrapper>
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
  chipClickable: {
    // Subtle hover/press feedback on web; on native the activeOpacity
    // setting on TouchableOpacity carries the affordance.
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  // Container around the code text. Padding/background on the container
  // so the touch target is the whole pill, not just the glyph.
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
  jumpHint: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
