// Persistent top navigation bar shared across all main screens.
//
// Brand on the left routes home (EvalScreen). Center carries the primary
// section links with an active state. Sign-out lives on the right.
//
// `currentRoute` controls the active-state highlight without making this
// component depend on react-navigation internals - the parent screen passes
// its own route name so the component stays purely presentational.
//
//   <TopNav navigation={navigation} currentRoute="Dashboard" />

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, shadows, typography } from '../theme';

// Sections that get highlighted in the nav. Detail screens map to a parent
// section so the active state stays consistent (e.g. CurriculumDetail
// belongs to Workspace).
const SECTION_BY_ROUTE = {
  Eval: 'workspace',
  AddAssignment: 'workspace',
  AddCurriculum: 'workspace',
  Output: 'workspace',
  CurriculumDetail: 'workspace',
  Tag: 'workspace',
  Report: 'workspace',
  Dashboard: 'dashboard',
  Settings: 'settings',
};

const LINKS = [
  { id: 'workspace', label: 'Workspace', route: 'Eval' },
  { id: 'dashboard', label: 'Dashboard', route: 'Dashboard' },
  { id: 'settings', label: 'Settings', route: 'Settings' },
];

export default function TopNav({ navigation, currentRoute }) {
  const activeSection = SECTION_BY_ROUTE[currentRoute] || null;

  const goHome = () => {
    if (currentRoute === 'Eval') return;
    // Use replace from sub-screens so the back stack doesn't grow forever
    // when the user bounces between sections via the brand link.
    if (navigation?.canGoBack && navigation.canGoBack()) {
      navigation.popToTop();
    } else {
      navigation.navigate('Eval');
    }
  };

  const navTo = (route) => {
    if (currentRoute === route) return;
    navigation.navigate(route);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigation.replace('Login');
  };

  return (
    <View style={styles.bar}>
      <TouchableOpacity onPress={goHome} accessibilityRole="link">
        <Text style={styles.brand}>GradeFlow</Text>
      </TouchableOpacity>

      <View style={styles.links}>
        {LINKS.map((l) => {
          const active = activeSection === l.id;
          return (
            <TouchableOpacity
              key={l.id}
              onPress={() => navTo(l.route)}
              style={[styles.linkBtn, active && styles.linkBtnActive]}
              accessibilityRole="link"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.linkText, active && styles.linkTextActive]}>
                {l.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.right}>
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 24,
    ...(Platform.OS === 'web' ? { position: 'sticky', top: 0, zIndex: 10 } : null),
  },
  brand: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.3,
  },
  links: {
    flexDirection: 'row',
    gap: 4,
    flex: 1,
  },
  linkBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  linkBtnActive: {
    backgroundColor: colors.primaryLight,
  },
  linkText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  linkTextActive: {
    color: colors.primaryDark,
  },
  right: {
    marginLeft: 'auto',
  },
  signOutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  signOut: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
