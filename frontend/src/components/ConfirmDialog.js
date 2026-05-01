// Imperative confirm dialog. Use it like window.confirm() but with custom
// title/body and an optional destructive variant.
//
//   const confirm = useConfirm();
//   const ok = await confirm({
//     title: 'Delete this curriculum?',
//     body: 'Assignments using it will lose their link. This cannot be undone.',
//     confirmLabel: 'Delete',
//     destructive: true,
//   });
//   if (!ok) return;
//
// Mount <ConfirmDialogProvider> once near the root, alongside ToastProvider.

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
} from 'react-native';
import { colors, shadows, typography } from '../theme';

const ConfirmContext = createContext(null);

const DEFAULTS = {
  title: 'Are you sure?',
  body: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  destructive: false,
};

export function ConfirmDialogProvider({ children }) {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ ...DEFAULTS, ...(opts || {}) });
    });
  }, []);

  const close = (result) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setState(null);
    if (r) r(result);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        visible={!!state}
        transparent
        animationType="fade"
        onRequestClose={() => close(false)}
      >
        <TouchableWithoutFeedback onPress={() => close(false)}>
          <View style={styles.backdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.card}>
                <Text style={styles.title}>{state?.title}</Text>
                {state?.body ? (
                  <Text style={styles.body}>{state.body}</Text>
                ) : null}
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => close(false)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.cancelText}>{state?.cancelLabel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.confirmBtn,
                      state?.destructive ? styles.confirmBtnDestructive : null,
                    ]}
                    onPress={() => close(true)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.confirmText}>{state?.confirmLabel}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    if (typeof console !== 'undefined') {
      console.warn(
        'useConfirm() called outside <ConfirmDialogProvider>; auto-confirming false',
      );
    }
    return async () => false;
  }
  return ctx;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 22,
    width: '100%',
    maxWidth: 460,
    gap: 10,
    ...shadows.card,
  },
  title: {
    ...typography.subheading,
    fontSize: 17,
  },
  body: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  confirmBtnDestructive: {
    backgroundColor: colors.danger,
  },
  confirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
