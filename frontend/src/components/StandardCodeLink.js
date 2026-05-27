import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { colors, shadows } from '../theme';

export default function StandardCodeLink({
  code,
  standardText,
  color,
  onPress,
}) {
  const [hover, setHover] = useState(false);
  const showTip = hover && !!standardText?.trim();

  const webHoverProps =
    Platform.OS === 'web' && standardText
      ? {
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
        }
      : {};

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="link"
        accessibilityLabel={
          standardText
            ? `${code}: ${standardText}`
            : `Open ${code} in its curriculum`
        }
        {...webHoverProps}
        style={[styles.codeBtn, onPress && styles.codeBtnLinked]}
        {...(Platform.OS === 'web' && onPress
          ? { onPressIn: (e) => e?.stopPropagation?.() }
          : {})}
      >
        <Text
          style={[
            styles.codeText,
            { color },
            onPress && styles.codeTextLinked,
          ]}
        >
          {code}
        </Text>
      </TouchableOpacity>

      {showTip ? (
        <View style={styles.tooltip} pointerEvents="none">
          <Text style={styles.tooltipLabel}>{code}</Text>
          <Text style={styles.tooltipBody}>{standardText}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    zIndex: 1,
    ...(Platform.OS === 'web' ? { overflow: 'visible' } : null),
  },
  codeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#eef1f6',
  },
  codeBtnLinked: {
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
  tooltip: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 6,
    minWidth: 240,
    maxWidth: 360,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    zIndex: 1000,
    ...shadows.card,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }
      : null),
  },
  tooltipLabel: {
    fontFamily: 'Menlo',
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  tooltipBody: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textPrimary,
  },
});
