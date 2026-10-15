import { Pressable, useTVBackHandling } from './focus';
import React, { useEffect, useRef } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { colors, radius, glass, isTV, isIOS, textSize } from './theme';
import { Button } from './components';
import { useT } from './i18n';
import { NativeGlass } from './glass-view';
import { TVFocusMemory } from './focus-memory';

const keepScreenFocus = () => {};
export function Dialog({
  visible,
  onClose,
  title,
  children,
  wide,
  dismissible = true,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  dismissible?: boolean;
}) {
  useTVBackHandling(visible);
  const t = useT();
  const Panel = isTV ? NativeGlass : View;
  if (isIOS)
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        allowSwipeDismissal={dismissible}
        onRequestClose={onClose}
      >
        <SafeAreaProvider>
          <SafeAreaView edges={['bottom', 'left', 'right']} style={s.sheet}>
            <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
              <View style={s.sheetHeader}>
                <Text accessibilityRole="header" style={s.sheetTitle}>
                  {title}
                </Text>
                <Button
                  variant="ghost"
                  compact
                  disabled={!dismissible}
                  onPress={onClose}
                >
                  <Text style={{ color: colors.accent }}>{t.done}</Text>
                </Button>
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                contentContainerStyle={s.sheetContent}
              >
                {children}
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    );
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TVFocusMemory.Provider value={keepScreenFocus}>
        <View style={s.overlay}>
          <Pressable
            focusable={!isTV}
            accessibilityLabel="Close dialog"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
          <Panel
            style={[
              isTV ? s.tvPanel : s.panel,
              wide && { maxWidth: 780 },
              isTV && { maxWidth: wide ? 1300 : 1000 },
            ]}
          >
            <View style={s.header}>
              <Text style={s.title}>{title}</Text>
              <Button
                icon={X}
                compact
                variant="ghost"
                label="Close dialog"
                preferredFocus={isTV}
                onPress={onClose}
              />
            </View>
            <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
              {children}
            </ScrollView>
          </Panel>
        </View>
      </TVFocusMemory.Provider>
    </Modal>
  );
}
export function ConfirmDialog({
  visible,
  title,
  description,
  confirm,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  description: string;
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const callbacks = useRef({ onConfirm, onCancel });
  callbacks.current = { onConfirm, onCancel };
  useEffect(() => {
    if (!isIOS || !visible) return;
    Alert.alert(title, description, [
      {
        text: t.cancel,
        style: 'cancel',
        onPress: () => callbacks.current.onCancel(),
      },
      {
        text: confirm,
        style: 'destructive',
        onPress: () => callbacks.current.onConfirm(),
      },
    ]);
  }, [visible, title, description, confirm, t.cancel]);
  if (isIOS) return null;
  return (
    <Dialog visible={visible} onClose={onCancel} title={title}>
      <Text
        style={{
          color: colors.muted,
          fontSize: textSize(14),
          lineHeight: textSize(23),
        }}
      >
        {description}
      </Text>
      <View
        style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}
      >
        <Button onPress={onCancel}>Cancel</Button>
        <Button variant="danger" onPress={onConfirm}>
          {confirm}
        </Button>
      </View>
    </Dialog>
  );
}
const s = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.surface },
  sheetHeader: {
    paddingLeft: 20,
    paddingRight: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: '600', flex: 1 },
  sheetContent: {
    padding: 20,
    paddingBottom: 32,
    gap: 20,
    width: '100%',
    maxWidth: 780,
    alignSelf: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: '#00000080',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  panel: {
    width: '100%',
    maxWidth: 530,
    maxHeight: '85%',
    borderRadius: radius.hero,
    ...glass,
    borderWidth: 1,
    borderColor: '#ffffff24',
    overflow: 'hidden',
  },
  tvPanel: {
    width: '100%',
    maxWidth: 1000,
    maxHeight: '85%',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#ffffff24',
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  title: {
    color: colors.text,
    fontSize: textSize(22),
    fontWeight: '700',
    flex: 1,
    letterSpacing: -0.5,
  },
});
