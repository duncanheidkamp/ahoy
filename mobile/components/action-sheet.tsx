// Minimal cross-platform action sheet (Android's Alert caps at 3 buttons).

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors, minTouch, radii, spacing, type } from '@/theme'

export interface SheetAction {
  label: string
  destructive?: boolean
  onPress: () => void
}

export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean
  title?: string
  actions: SheetAction[]
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu" accessibilityRole="button">
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} onStartShouldSetResponder={() => true}>
          {title ? (
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
          ) : null}
          {actions.map((a) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              onPress={() => {
                onClose()
                a.onPress()
              }}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <Text style={[styles.actionText, a.destructive && styles.destructive]}>{a.label}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.action, styles.cancel, pressed && styles.pressed]}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  title: { ...type.heading, color: colors.accent, textAlign: 'center', marginBottom: spacing.xs },
  action: {
    minHeight: minTouch + 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
  },
  pressed: { opacity: 0.8 },
  actionText: { ...type.bodyBold, color: colors.text },
  destructive: { color: colors.dangerText },
  cancel: { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border, marginTop: spacing.xs },
  cancelText: { ...type.bodyBold, color: colors.secondaryText },
})
