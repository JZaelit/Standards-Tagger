// Animated grey-block placeholder used while data loads. Drop-in replacement
// for an ActivityIndicator when the eventual layout is known.
//
//   {loading ? (
//     <>
//       <SkeletonRow height={64} />
//       <SkeletonRow height={64} />
//       <SkeletonRow height={64} />
//     </>
//   ) : (
//     rows.map(...)
//   )}

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Platform } from 'react-native';
import { colors } from '../theme';

export default function SkeletonRow({
  height = 56,
  width,
  borderRadius = 10,
  style,
}) {
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: 800,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.row,
        { height, borderRadius, opacity },
        width != null ? { width } : null,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.border,
    width: '100%',
  },
});
