// Source-file viewer for the OutputScreen. Mirrors the dashboard's source
// panel: shows the original lesson's title/description, then per section a
// title/description and a list of objectives with title + description +
// evaluation_type + points.
//
// Two view modes via an internal toggle: Rendered (formatted) and Raw JSON.
//
// jumpToObjective(secIdx, objIdx, opts?) scrolls to and highlights the
// matching objective. opts.highlightExcerpt marks the exact phrase inline.

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
import { parseHtmlBlocks, stripHtml, findExcerptSpan } from '../lib/htmlText';

function HighlightedDescription({ html, excerpt, active }) {
  const plain = stripHtml(html || '');
  if (!active || !excerpt || !plain) {
    return parseHtmlBlocks(html).map((b, k) => (
      <Text key={k} style={styles.objDesc}>{b}</Text>
    ));
  }

  const span = findExcerptSpan(plain, excerpt);
  if (!span) {
    return (
      <>
        {parseHtmlBlocks(html).map((b, k) => (
          <Text key={k} style={styles.objDesc}>{b}</Text>
        ))}
        <Text style={styles.highlightExcerpt}>{`\u201c${excerpt}\u201d`}</Text>
      </>
    );
  }

  return (
    <Text style={styles.objDesc}>
      {plain.slice(0, span.start)}
      <Text style={styles.excerptMark}>{span.match}</Text>
      {plain.slice(span.end)}
    </Text>
  );
}

const SourcePanel = forwardRef(function SourcePanel(
  { source, onScrollRequest, scrollViewRef },
  ref
) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('rendered'); // 'rendered' | 'raw'
  const objLayoutsRef = useRef({});
  const objYRef = useRef({});
  const objBoxRefs = useRef({});
  const [activeFlash, setActiveFlash] = useState(null);
  const containerRef = useRef(null);

  const keyOf = (sec, obj) => `${sec}-${obj}`;

  const handleObjLayout = useCallback((sec, obj, e) => {
    objYRef.current[keyOf(sec, obj)] = e.nativeEvent.layout.y;
  }, []);

  const ensureFlashAnim = (key) => {
    if (!objLayoutsRef.current[key]) {
      objLayoutsRef.current[key] = new Animated.Value(0);
    }
    return objLayoutsRef.current[key];
  };

  const flashObjective = (sec, obj, opts = {}) => {
    const key = keyOf(sec, obj);
    setActiveFlash({
      key,
      standardCode: opts.standardCode || null,
      highlightExcerpt: opts.highlightExcerpt || null,
    });
    const anim = ensureFlashAnim(key);
    anim.setValue(0);
    Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 250, useNativeDriver: false }),
      Animated.delay(3500),
      Animated.timing(anim, { toValue: 0, duration: 700, useNativeDriver: false }),
    ]).start(() => {
      setActiveFlash(null);
    });
  };

  const scrollToObjective = (sec, obj, opts, onDone) => {
    const key = keyOf(sec, obj);
    const domNode = objBoxRefs.current[key];

    if (Platform.OS === 'web' && domNode?.scrollIntoView) {
      domNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onDone();
      return;
    }

    const localY = objYRef.current[key];
    const node = containerRef.current && findNodeHandle(containerRef.current);
    const scrollNode = scrollViewRef?.current
      ? findNodeHandle(scrollViewRef.current)
      : null;

    if (localY != null && node && scrollNode && UIManager.measureLayout) {
      UIManager.measureLayout(
        node,
        scrollNode,
        () => onDone(),
        (x, y) => {
          const targetY = (y || 0) + localY - 80;
          scrollViewRef.current?.scrollTo?.({
            y: Math.max(0, targetY),
            animated: true,
          });
          onDone();
        },
      );
      return;
    }

    if (onScrollRequest) {
      onScrollRequest({ sec, obj, ...opts });
    }
    onDone();
  };

  const jumpTo = (sec, obj, opts = {}) => {
    setOpen(true);
    setView('rendered');
    setTimeout(() => {
      scrollToObjective(sec, obj, opts, () => flashObjective(sec, obj, opts));
    }, 120);
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
  const rawJson = JSON.stringify(source, null, 2);

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
              style={styles.rawScrollVertical}
              contentContainerStyle={styles.rawScrollContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator
              >
                <Text style={styles.rawText} selectable>
                  {rawJson}
                </Text>
              </ScrollView>
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
                  const meta = activeFlash?.key === key ? activeFlash : null;
                  const bg = flash.interpolate({
                    inputRange: [0, 1],
                    outputRange: [colors.white, '#fef9c3'],
                  });
                  const border = flash.interpolate({
                    inputRange: [0, 1],
                    outputRange: [colors.border, '#ca8a04'],
                  });
                  return (
                    <Animated.View
                      key={j}
                      ref={(el) => {
                        if (el) objBoxRefs.current[key] = el;
                      }}
                      onLayout={(e) => handleObjLayout(i, j, e)}
                      style={[
                        styles.objBox,
                        { backgroundColor: bg, borderColor: border, borderWidth: 2 },
                      ]}
                    >
                      {meta?.standardCode ? (
                        <View style={styles.taggedBadge}>
                          <Text style={styles.taggedBadgeText}>
                            {`Match: ${meta.standardCode}`}
                          </Text>
                        </View>
                      ) : null}
                      <Text style={styles.objTitle}>
                        {obj.title || ''}
                      </Text>
                      <HighlightedDescription
                        html={obj.description}
                        excerpt={meta?.highlightExcerpt}
                        active={!!meta}
                      />
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
    marginBottom: 8,
  },
  taggedBadge: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
    backgroundColor: '#ca8a04',
  },
  taggedBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Menlo',
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
  excerptMark: {
    backgroundColor: '#fde047',
    color: colors.textPrimary,
    fontWeight: '700',
    paddingHorizontal: 2,
    borderRadius: 2,
  },
  highlightExcerpt: {
    fontSize: 12,
    color: colors.textPrimary,
    lineHeight: 17,
    fontWeight: '700',
    fontStyle: 'italic',
    marginTop: 6,
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
    height: 420,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { overflow: 'auto' } : null),
  },
  rawScrollVertical: {
    flex: 1,
  },
  rawScrollContent: {
    padding: 12,
    flexGrow: 1,
  },
  rawText: {
    color: '#e5e7eb',
    fontFamily: 'Menlo',
    fontSize: 11,
    lineHeight: 16,
  },
});

export default SourcePanel;
