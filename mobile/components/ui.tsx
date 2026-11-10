// Small shared building blocks. All styling comes from theme.ts.

import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native'

import { colors, minTouch, radii, spacing, type } from '@/theme'

type ButtonVariant = 'primary' | 'secondary' | 'danger'

interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string
  variant?: ButtonVariant
  loading?: boolean
  style?: StyleProp<ViewStyle>
  compact?: boolean
}

export function Button({ title, variant = 'primary', loading, disabled, style, compact, ...rest }: ButtonProps) {
  const isDisabled = disabled || loading
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rest.accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      hitSlop={compact ? 6 : undefined}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        variantStyles[variant].container,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles[variant].text.color} />
      ) : (
        <Text style={[styles.buttonText, variantStyles[variant].text]}>{title}</Text>
      )}
    </Pressable>
  )
}

export function TextField({ label, hint, style, ...rest }: TextInputProps & { label: string; hint?: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.placeholder}
        style={[styles.input, style]}
        {...rest}
      />
      {hint ? <View style={styles.hint}>{hint}</View> : null}
    </View>
  )
}

export function Centered({ children }: { children: ReactNode }) {
  return <View style={styles.centered}>{children}</View>
}

export function Loading() {
  return (
    <Centered>
      <ActivityIndicator color={colors.accent} size="large" />
    </Centered>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.sectionTitle}>
      {children}
    </Text>
  )
}

export function MutedText({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>
}

const styles = StyleSheet.create({
  button: {
    minHeight: minTouch + 4,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: { minHeight: minTouch, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  buttonText: { ...type.button, textTransform: 'uppercase' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
  field: { gap: spacing.xs },
  label: { ...type.small, color: colors.textSubtle },
  input: {
    ...type.body,
    minHeight: minTouch + 4,
    color: colors.text,
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  hint: { minHeight: 18 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  sectionTitle: { ...type.heading, color: colors.accent, marginBottom: spacing.sm },
  muted: { ...type.body, color: colors.textMuted, textAlign: 'center' },
})

const variantStyles = {
  primary: StyleSheet.create({
    container: { backgroundColor: colors.primary },
    text: { color: colors.primaryText },
  }),
  secondary: StyleSheet.create({
    container: { backgroundColor: colors.secondary, borderColor: colors.border, borderWidth: 1 },
    text: { color: colors.secondaryText },
  }),
  danger: StyleSheet.create({
    container: { backgroundColor: colors.danger },
    text: { color: colors.text },
  }),
} as const
