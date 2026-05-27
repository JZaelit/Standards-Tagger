import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { colors } from '../theme';

function EyeIcon({ visible, size = 18, color = colors.primary }) {
  const w = size * 1.35;
  const h = size * 0.72;
  return (
    <View style={[styles.iconWrap, { width: w + 4, height: size }]}>
      <View
        style={[
          styles.eyeOuter,
          {
            width: w,
            height: h,
            borderRadius: h,
            borderColor: color,
          },
        ]}
      >
        <View
          style={[
            styles.eyeInner,
            {
              width: size * 0.34,
              height: size * 0.34,
              borderRadius: size,
              borderColor: color,
            },
          ]}
        />
      </View>
      {!visible ? (
        <View
          style={[
            styles.slash,
            {
              width: w + 6,
              backgroundColor: color,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

export default function SectionVisibilityToggle({ included, onPress }) {
  return (
    <TouchableOpacity
      onPress={(e) => {
        if (Platform.OS === 'web' && e?.preventDefault) e.preventDefault();
        onPress?.(e);
      }}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel={
        included
          ? 'Exclude section from alignment metrics'
          : 'Include section in alignment metrics'
      }
      {...(Platform.OS === 'web'
        ? { type: 'button', onPressIn: (e) => e?.stopPropagation?.() }
        : {})}
    >
      <EyeIcon visible={included} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingLeft: 8,
    paddingVertical: 2,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeOuter: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeInner: {
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  slash: {
    position: 'absolute',
    height: 2,
    borderRadius: 1,
    transform: [{ rotate: '-40deg' }],
  },
});
