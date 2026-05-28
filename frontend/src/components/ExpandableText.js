import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';

const DEFAULT_MAX_CHARS = 160;

function smartPreview(text, maxChars) {
  const raw = (text || '').trim();
  if (raw.length <= maxChars) return raw;
  const slice = raw.slice(0, maxChars).trimEnd();
  const lastWord = slice.lastIndexOf(' ');
  const base = lastWord > Math.floor(maxChars * 0.6) ? slice.slice(0, lastWord) : slice;
  return `${base.trimEnd()}…`;
}

export default function ExpandableText({
  text,
  style,
  bodyStyle,
  maxChars = DEFAULT_MAX_CHARS,
  moreLabel = 'Show full description',
  lessLabel = 'Show less',
}) {
  const [open, setOpen] = useState(false);
  const body = (text || '').trim();
  if (!body) return null;

  const needsToggle = body.length > maxChars;
  if (!needsToggle) {
    return <Text style={[styles.body, style, bodyStyle]}>{body}</Text>;
  }

  const preview = smartPreview(body, maxChars);

  return (
    <View style={style}>
      <Text style={[styles.body, bodyStyle]}>{open ? body : preview}</Text>
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.toggleText}>{open ? lessLabel : moreLabel}</Text>
        <Text style={styles.chevron}>{open ? '\u25B2' : '\u25BC'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  chevron: {
    fontSize: 8,
    color: colors.primary,
    fontWeight: '700',
  },
});
