import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';

export default function StandardCodeLink({
  code,
  color,
  onPress,
}) {
  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="link"
        accessibilityLabel={`Open ${code} in its curriculum`}
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
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
});
