// Source-file viewer for the OutputScreen. Mirrors the dashboard's source
// panel: shows the original lesson's title/description, then per section a
// title/description and a list of objectives with title + description +
// evaluation_type + points.
//
// Two view modes via an internal toggle: Rendered (formatted) and Raw JSON.
//
// jumpToObjective(secIdx, objIdx) is exposed via ref so the parent screen
// can scroll to and flash the matching objective when the user clicks
// "View original" from an alignment row.

import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  findNodeHandle,
  UIManager,
  Platform,
} from 'react-native';
import { colors, shadows, typography } from '../theme';
import { parseHtmlBlocks } from '../lib/htmlText';

const SourcePanel = forwardRef(function SourcePanel(
  { source, onScrollRequest, scrollViewRef },
  ref
) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('rendered'); // 'rendered' | 'raw'
  const objLayoutsRef = useRef({}); // key -> Animated.Value (current bg color)
  const objYRef = useRef({}); // key -> y-position inside SourcePanel's parent ScrollView
  const containerRef = useRef(null);

  const keyOf = (sec, obj) => `${sec}-${obj}`;

  const handleObjLayout = useCallback((sec, obj, e) => {
    // We capture the y of each objective relative to the parent ScrollView so
    // jumpToObjective can scroll to it. e.nativeEvent.layout.y is relative to
    // this view; we add the panel's own Y to it on demand using measure().
    objYRef.current[keyOf(sec, obj)] = e.nativeEvent.layout.y;
  }, []);

  const ensureFlashAnim = (key) => {
    if (!objLayoutsRef.current[key]) {
      objLayoutsRef.current[key] = new Animated.Value(0);
    }
    return objLayoutsRef.current[key];
  };

  const flashObjective = (sec, obj) => {
    const key = keyOf(sec, obj);
    const anim = ensureFlashAnim(key);
    anim.setValue(0);
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 250, useNativeDriver: false }),
      Animated.delay(900),
      Animated.timing(anim, { toValue: 0, duration: 600, useNativeDriver: false }),
    ]).start();
  };

  const jumpTo = (sec, obj) => {
    setOpen(true);
    setView('rendered');
    // Scroll on next tick so the panel has expanded and laid out.
    setTimeout(() => {
      const localY = objYRef.current[keyOf(sec, obj)];
      const node = containerRef.current && findNodeHandle(containerRef.current);
      const scrollNode = scrollViewRef && scrollViewRef.current
        ? findNodeHandle(scrollViewRef.current)
        : null;
      if (localY != null && node && scrollNode && UIManager.measureLayout) {
        UIManager.measureLayout(
          node,
          scrollNode,
          () => {},
          (x, y) => {
            const targetY = (y || 0) + localY - 40;
            if (scrollViewRef.current?.scrollTo) {
              scrollViewRef.current.scrollTo({ y: Math.max(0, targetY), animated: true });
            }
            flashObjective(sec, obj);
          }
        );
      } else if (onScrollRequest) {
        onScrollRequest({ sec, obj });
        flashObjective(sec, obj);
      } else {
        flashObjective(sec, obj);
      }
    }, 80);
  };

  useImperativeHandle(ref, () => ({ jumpTo }), [scrollViewRef]);

  if (!source) {
    return (
      <View style={styles.bar}>
        <Text style={styles.barLabel}>Source</Text>
        <Text style={styles.barMissing}>Not embedded.</Text>
      </View>
    );
  }

  const blocks = view === 'rendered' ? parseHtmlBlocks(source.description) : [];

  return (
    <View ref={containerRef}>
      <View style={styles.bar}>
        <Text style={styles.barLabel}>Source</Text>
        <Text style={styles.barPath} numberOfLines={1}>
          {source.path || ''}
        </Text>
        <View style={styles.barRight}>
          <TouchableOpacity
            style={[styles.barBtn, open && styles.barBtnActive]}
            onPress={() => setOpen((o) => !o)}
          >
            <Text style={[styles.barBtnText, open && styles.barBtnTextActive]}>
              {open ? 'Hide source' : 'View source'}
            </Text>
          </TouchableOpacity>
          {open ? (
            <View style={styles.barRightInner}>
              <TouchableOpacity
                style={[styles.barBtn, view === 'rendered' && styles.barBtnActive]}
                onPress={() => setView('rendered')}
              >
                <Text style={[styles.barBtnText, view === 'rendered' && styles.barBtnTextActive]}>
                  Rendered
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.barBtn, view === 'raw' && styles.barBtnActive]}
                onPress={() => setView('raw')}
              >
                <Text style={[styles.barBtnText, view === 'raw' && styles.barBtnTextActive]}>
                  Raw JSON
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>

      {open ? (
        view === 'raw' ? (
          <View style={styles.rawWrap}>
            <ScrollView
              horizontal
              style={styles.rawScroll}
              contentContainerStyle={{ padding: 12 }}
            >
              <Text style={styles.rawText} selectable>
                {JSON.stringify(source, null, 2)}
              </Text>
            </ScrollView>
          </View>
        ) : (
          <View style={styles.panel}>
            {source.title ? (
              <Text style={styles.srcTitle}>{source.title}</Text>
            ) : null}
            {blocks.map((b, i) => (
              <Text key={i} style={styles.srcDesc}>{b}</Text>
            ))}

            {(source.sections || []).map((sec, i) => (
              <View key={i} style={styles.section}>
                <Text style={styles.sectionLabel}>
                  {`Section ${i + 1}: ${sec.title || ''}`}
                </Text>
                {parseHtmlBlocks(sec.description).map((b, k) => (
                  <Text key={k} style={styles.secDesc}>{b}</Text>
                ))}
                {(sec.objectives || []).map((obj, j) => {
                  const key = keyOf(i, j);
                  const flash = ensureFlashAnim(key);
                  const bg = flash.interpolate({
                    inputRange: [0, 1],
                    outputRange: [colors.white, colors.primaryLight],
                  });
                  const border = flash.interpolate({
                    inputRange: [0, 1],
                    outputRange: [colors.border, colors.primary],
                  });
                  return (
                    <Animated.View
                      key={j}
                      onLayout={(e) => handleObjLayout(i, j, e)}
                      style={[
                        styles.objBox,
                        { backgroundColor: bg, borderColor: border },
                      ]}
                    >
                      <Text style={styles.objTitle}>
                        {obj.title || ''}
                      </Text>
                      {parseHtmlBlocks(obj.description).map((b, k) => (
                        <Text key={k} style={styles.objDesc}>{b}</Text>
                      ))}
                      <Text style={styles.objMeta}>
                        {[
                          obj.evaluation_type,
                          obj.points != null ? `${obj.points} pt` : null,
                          `sections[${i}].objectives[${j}]`,
                        ].filter(Boolean).join(' \u00b7 ')}
                      </Text>
                    </Animated.View>
                  );
                })}
              </View>
            ))}
          </View>
        )
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    padding: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  barLabel: {
    ...typography.label,
    fontSize: 11,
  },
  barPath: {
    flex: 1,
    fontFamily: 'Menlo',
    fontSize: 12,
    color: colors.textPrimary,
    minWidth: 200,
  },
  barMissing: {
    fontSize: 12,
    color: colors.danger,
    fontStyle: 'italic',
  },
  barRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
  },
  barRightInner: {
    flexDirection: 'row',
    gap: 4,
  },
  barBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  barBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  barBtnText: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  barBtnTextActive: {
    color: '#fff',
  },
  panel: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    marginTop: 8,
    ...shadows.card,
  },
  srcTitle: {
    ...typography.subheading,
    fontSize: 16,
    marginBottom: 6,
  },
  srcDesc: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 19,
    marginBottom: 8,
  },
  section: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textPrimary,
    fontSize: 12,
    marginBottom: 6,
  },
  secDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    marginBottom: 6,
  },
  objBox: {
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 8,
  },
  objTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  objDesc: {
    fontSize: 12,
    color: '#374151',
    lineHeight: 17,
    marginTop: 2,
  },
  objMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: 'Menlo',
    marginTop: 6,
  },
  rawWrap: {
    backgroundColor: '#1c1f24',
    borderRadius: 6,
    marginTop: 8,
    maxHeight: 420,
    overflow: 'hidden',
  },
  rawScroll: {
    maxHeight: 420,
  },
  rawText: {
    color: '#e5e7eb',
    fontFamily: 'Menlo',
    fontSize: 11,
    lineHeight: 16,
  },
});

export default SourcePanel;
