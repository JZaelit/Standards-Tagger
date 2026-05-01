// 3-dot menu. Web-friendly: backdrop-dismissible Modal with a small option card.
//
// Usage:
//   const [open, setOpen] = useState(false);
//   <MenuTrigger onPress={() => setOpen(true)} />
//   <Menu
//     visible={open}
//     onClose={() => setOpen(false)}
//     options={[
//       { label: 'Edit', onPress: handleEdit },
//       { label: 'Delete', onPress: handleDelete, destructive: true },
//     ]}
//   />
//
// Each option onPress handler runs after the menu closes, so navigating
// to another screen from the option doesn't fight the closing animation.

import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
} from 'react-native';
import { colors, shadows } from '../theme';

export function MenuTrigger({ onPress, accessibilityLabel = 'More actions' }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.trigger}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={styles.triggerDots}>{'\u22ef'}</Text>
    </TouchableOpacity>
  );
}

export default function Menu({ visible, onClose, options = [], anchor = 'top-right' }) {
  const handlePress = (opt) => {
    onClose();
    // Defer the action a tick so the close animation can start.
    if (typeof opt.onPress === 'function') {
      setTimeout(() => opt.onPress(), 50);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={[styles.backdrop, anchorStyles[anchor]]}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              {options.map((opt, i) => (
                <TouchableOpacity
                  key={`${opt.label}-${i}`}
                  style={[styles.option, opt.disabled && styles.optionDisabled]}
                  onPress={() => !opt.disabled && handlePress(opt)}
                  disabled={!!opt.disabled}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.optionText,
                      opt.destructive && styles.optionTextDestructive,
                      opt.disabled && styles.optionTextDisabled,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const anchorStyles = StyleSheet.create({
  // Where the option card sits on screen. We don't try to anchor to the
  // exact trigger position (cross-platform measurement is fiddly); instead
  // we let the caller pick a screen quadrant. 'top-right' fits cards in a
  // grid where the trigger lives in the corner.
  'top-right': {
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 70,
    paddingRight: 24,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

const styles = StyleSheet.create({
  trigger: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerDots: {
    color: colors.textSecondary,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: -2,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.20)',
    padding: 12,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingVertical: 6,
    minWidth: 180,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  option: {
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  optionTextDestructive: {
    color: colors.danger,
  },
  optionTextDisabled: {
    color: colors.textLight,
  },
});
