import { Pressable, useTVBackHandling } from './focus';
import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { colors, isTV, textSize } from './theme';
import { Button } from './components';
export function Dialog({
  visible,
  onClose,
  title,
  children,
  wide,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useTVBackHandling(visible);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <Pressable
          focusable={!isTV}
          accessibilityLabel="Close dialog"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            s.panel,
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
              onPress={onClose}
            />
          </View>
          <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
            {children}
          </ScrollView>
        </View>
      </View>
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
  overlay: {
    flex: 1,
    backgroundColor: '#000000aa',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  panel: {
    width: '100%',
    maxWidth: 530,
    maxHeight: '85%',
    borderRadius: 15,
    backgroundColor: colors.sidebar,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  title: {
    color: colors.text,
    fontSize: textSize(20),
    fontWeight: '600',
    flex: 1,
    letterSpacing: -0.5,
  },
});
