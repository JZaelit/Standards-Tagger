export const colors = {
  primary: '#10b981',       // emerald green
  primaryDark: '#059669',
  primaryLight: '#d1fae5',
  background: '#f9fafb',
  white: '#ffffff',
  border: '#e5e7eb',
  textPrimary: '#111827',
  textSecondary: '#6b7280',
  textLight: '#9ca3af',
  danger: '#ef4444',
  shadow: '#000000',
};

export const shadows = {
  card: {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
};

export const typography = {
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subheading: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  body: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
};
