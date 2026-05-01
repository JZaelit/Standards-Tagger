// Toast provider + useToast() hook.
//
// One toast visible at a time. New show() replaces the current toast and
// resets the timer. Toasts can carry an optional action (used for the undo
// pattern on delete: { label: 'Undo', onPress: restoreRow }).
//
// Usage:
//   const toast = useToast();
//   toast.show('Saved');
//   toast.show('Deleted assignment',
//     { action: { label: 'Undo', onPress: restore }, durationMs: 5000 });
//   toast.dismiss();
//
// Mount <ToastProvider> once near the root, above NavigationContainer.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { colors, shadows } from '../theme';

const ToastContext = createContext(null);

const DEFAULT_DURATION_MS = 4000;

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  const dismiss = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(translateY, {
        toValue: 20,
        duration: 150,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start(() => setToast(null));
  }, [opacity, translateY]);

  const show = useCallback(
    (message, opts = {}) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const next = {
        message,
        action: opts.action || null,
        // tone: 'default' | 'success' | 'danger'
        tone: opts.tone || 'default',
      };
      setToast(next);
      // Reset position so the slide-in plays even on consecutive shows.
      opacity.setValue(0);
      translateY.setValue(20);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
      const ms = opts.durationMs ?? DEFAULT_DURATION_MS;
      timerRef.current = setTimeout(() => dismiss(), ms);
    },
    [dismiss, opacity, translateY],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleAction = () => {
    if (toast?.action?.onPress) {
      try {
        toast.action.onPress();
      } catch (e) {
        // Don't let an action handler crash the provider.
        if (typeof console !== 'undefined') console.error(e);
      }
    }
    dismiss();
  };

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      {toast ? (
        <View pointerEvents="box-none" style={styles.host}>
          <Animated.View
            pointerEvents="auto"
            style={[
              styles.toast,
              toast.tone === 'danger' ? styles.toastDanger : null,
              toast.tone === 'success' ? styles.toastSuccess : null,
              { opacity, transform: [{ translateY }] },
            ]}
          >
            <Text style={styles.message} numberOfLines={3}>
              {toast.message}
            </Text>
            {toast.action ? (
              <TouchableOpacity
                onPress={handleAction}
                style={styles.actionBtn}
                accessibilityRole="button"
              >
                <Text style={styles.actionText}>{toast.action.label}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={dismiss}
                style={styles.dismissBtn}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
              >
                <Text style={styles.dismissText}>{'\u00d7'}</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Soft-fail so a missing provider doesn't crash the screen during
    // refactors. Still warn loudly in dev.
    if (typeof console !== 'undefined') {
      console.warn('useToast() called outside <ToastProvider>; toast suppressed');
    }
    return { show: () => {}, dismiss: () => {} };
  }
  return ctx;
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingBottom: 24,
    paddingHorizontal: 16,
    // Above modals and navigation chrome.
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 8,
    minWidth: 260,
    maxWidth: 520,
    gap: 12,
    ...shadows.card,
  },
  toastSuccess: {
    backgroundColor: colors.primaryDark,
  },
  toastDanger: {
    backgroundColor: '#7f1d1d',
  },
  message: {
    color: '#f9fafb',
    fontSize: 14,
    flexShrink: 1,
    flexGrow: 1,
  },
  actionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  actionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dismissBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  dismissText: {
    color: '#9ca3af',
    fontSize: 18,
    fontWeight: '700',
  },
});
