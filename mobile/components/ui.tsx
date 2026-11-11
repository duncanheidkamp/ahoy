// Small shared building blocks. All styling comes from theme.ts.

import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native'

import { createStyles, maxFontScale, minTouch, radii, rowMinHeight, spacing, type, useTheme } from '@/theme'

type ButtonVariant = 'primary' | 'secondary' | 'danger'

interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string
  variant?: ButtonVariant
  loading?: boolean
  style?: StyleProp<ViewStyle>
  compact?: boolean
}

export function Button({ title, variant = 'primary', loading, disabled, style, compact, ...rest }: ButtonProps) {
  const styles = useStyles()
  const isDisabled = disabled || loading
  const v = {
    primary: [styles.primary, styles.primaryText],
    secondary: [styles.secondary, styles.secondaryText],
    danger: [styles.danger, styles.dangerText],
  }[variant] as [ViewStyle, TextStyle]
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
        v[0],
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={v[1].color as string} />
      ) : (
        <Text style={[styles.buttonText, v[1]]}>{title}</Text>
      )}
    </Pressable>
  )
}

/** Tappable inline text (privacy policy, "Log out", …) with a 44pt target. */
export function LinkText({
  children,
  onPress,
  role = 'link',
  accessibilityLabel,
  style,
}: {
  children: ReactNode
  onPress: () => void
  role?: 'link' | 'button'
  accessibilityLabel?: string
  style?: StyleProp<TextStyle>
}) {
  const styles = useStyles()
  return (
    <Text accessibilityRole={role} accessibilityLabel={accessibilityLabel} style={[styles.link, style]} onPress={onPress}>
      {children}
    </Text>
  )
}

export function TextField({ label, hint, style, ...rest }: TextInputProps & { label: string; hint?: ReactNode }) {
  const styles = useStyles()
  const { colors } = useTheme()
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.placeholder}
        selectionColor={colors.link}
        style={[styles.input, style]}
        {...rest}
      />
      {hint ? <View style={styles.hint}>{hint}</View> : null}
    </View>
  )
}

export function Centered({ children }: { children: ReactNode }) {
  const styles = useStyles()
  return <View style={styles.centered}>{children}</View>
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  const { colors } = useTheme()
  return (
    <Centered>
      <ActivityIndicator color={colors.accent} size="large" accessibilityLabel={label} />
    </Centered>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const styles = useStyles()
  return (
    <Text accessibilityRole="header" style={styles.sectionTitle} maxFontSizeMultiplier={maxFontScale.display}>
      {children}
    </Text>
  )
}

/** Screen-level title in Pirata One. */
export function Title({ children, align = 'center' }: { children: ReactNode; align?: 'center' | 'left' }) {
  const styles = useStyles()
  return (
    <Text
      accessibilityRole="header"
      style={[styles.title, align === 'left' && styles.left]}
      maxFontSizeMultiplier={maxFontScale.display}
    >
      {children}
    </Text>
  )
}

export function MutedText({ children, align = 'center' }: { children: ReactNode; align?: 'center' | 'left' }) {
  const styles = useStyles()
  return <Text style={[styles.muted, align === 'left' && styles.left]}>{children}</Text>
}

export function ErrorText({ children }: { children: ReactNode }) {
  const styles = useStyles()
  return (
    <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>
      {children}
    </Text>
  )
}

/**
 * Empty / error states in one voice: a decorative mark, a Pirata One title,
 * one line of help, then actions.
 */
export function EmptyState({
  icon = '⚓',
  title,
  message,
  children,
}: {
  icon?: string
  title: string
  message?: string
  children?: ReactNode
}) {
  const styles = useStyles()
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon} importantForAccessibility="no" accessibilityElementsHidden>
        {icon}
      </Text>
      <Text accessibilityRole="header" style={styles.emptyTitle} maxFontSizeMultiplier={maxFontScale.display}>
        {title}
      </Text>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
      {children ? <View style={styles.emptyActions}>{children}</View> : null}
    </View>
  )
}

/** Static loading placeholders shaped like crew rows (no animation to reduce). */
export function RowSkeleton({ count = 6, rowHeight = rowMinHeight }: { count?: number; rowHeight?: number }) {
  const styles = useStyles()
  return (
    <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.skeletonList}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.skeletonRow, { minHeight: rowHeight }]}>
          <View style={[styles.skeletonBar, { width: `${45 + ((i * 17) % 30)}%` }]} />
          <View style={styles.skeletonDot} />
        </View>
      ))}
    </View>
  )
}

/** Card-shaped placeholders for list screens (Requests, Settings sections). */
export function CardSkeleton({ count = 3 }: { count?: number }) {
  const styles = useStyles()
  return (
    <View accessible accessibilityLabel="Loading" accessibilityRole="progressbar" style={styles.cardSkeletonList}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.cardSkeleton}>
          <View style={[styles.skeletonBar, { width: `${40 + ((i * 23) % 35)}%` }]} />
        </View>
      ))}
    </View>
  )
}

const useStyles = createStyles((c) => ({
  button: {
    minHeight: minTouch + 4,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: { minHeight: minTouch, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  buttonText: { ...type.button, textTransform: 'uppercase', textAlign: 'center' },
  primary: { backgroundColor: c.primary },
  primaryText: { color: c.primaryText },
  secondary: { backgroundColor: c.secondary, borderColor: c.border, borderWidth: 1 },
  secondaryText: { color: c.secondaryText },
  danger: { backgroundColor: c.danger },
  dangerText: { color: c.dangerOn },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
  link: {
    ...type.bodyBold,
    color: c.link,
    textAlign: 'center',
    minHeight: minTouch,
    paddingVertical: spacing.md,
    textDecorationLine: 'underline',
  },
  field: { gap: spacing.xs },
  label: { ...type.small, color: c.textSubtle },
  input: {
    ...type.body,
    minHeight: minTouch + 4,
    color: c.text,
    backgroundColor: c.inputBackground,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  hint: { minHeight: 18 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  sectionTitle: { ...type.heading, color: c.accent, marginBottom: spacing.xs },
  title: { ...type.title, color: c.accent, textAlign: 'center' },
  left: { textAlign: 'left' },
  muted: { ...type.body, color: c.textMuted, textAlign: 'center' },
  error: { ...type.small, color: c.dangerText },
  empty: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyIcon: { fontSize: 44, textAlign: 'center' },
  emptyTitle: { ...type.heading, color: c.accent, textAlign: 'center' },
  emptyActions: { gap: spacing.md, alignSelf: 'stretch', marginTop: spacing.sm },
  skeletonList: { gap: 2 },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    backgroundColor: c.skeleton,
  },
  skeletonBar: { height: 18, borderRadius: radii.sm, backgroundColor: c.skeleton },
  skeletonDot: { width: 24, height: 18, borderRadius: radii.sm, backgroundColor: c.skeleton },
  cardSkeletonList: { gap: spacing.sm },
  cardSkeleton: {
    minHeight: minTouch + 12,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: c.skeleton,
  },
}))
