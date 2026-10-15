import React, { useEffect, useRef } from 'react';
import { Modal, View, Text as NativeText } from 'react-native';
import {
  Button,
  Form,
  Host,
  LabeledContent,
  NavigationStack,
  Picker,
  Section,
  SecureField,
  Text,
  TextField,
  Toolbar,
  ToolbarItem,
  useNativeState,
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  autocorrectionDisabled,
  keyboardType,
  pickerStyle,
  tag,
  textInputAutocapitalization,
  navigationTitle,
} from '@expo/ui/swift-ui/modifiers';
import { colors, isTV } from './theme';

// Forms own their scrolling and safe-area layout. Never nest one in an RN ScrollView.
export function AppleForm({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        { flex: 1 },
        isTV && { width: '100%', maxWidth: 1100, alignSelf: 'center' },
      ]}
    >
      {isTV && title && (
        <NativeText
          style={{
            color: colors.text,
            fontSize: 48,
            fontWeight: '700',
            marginBottom: 24,
          }}
        >
          {title}
        </NativeText>
      )}
      <Host colorScheme="dark" style={{ flex: 1 }}>
        <Form>{children}</Form>
      </Host>
    </View>
  );
}

export function AppleSheet({
  visible,
  title,
  onClose,
  busy,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType={isTV ? 'fade' : 'slide'}
      presentationStyle={isTV ? 'fullScreen' : 'pageSheet'}
      onRequestClose={() => !busy && onClose()}
      allowSwipeDismissal={!busy}
    >
      {isTV ? (
        <View
          style={{
            flex: 1,
            paddingVertical: 60,
            paddingHorizontal: 180,
            backgroundColor: colors.background,
          }}
        >
          <AppleForm title={title}>
            <Section>
              <Button label="Done" onPress={onClose} />
            </Section>
            {children}
          </AppleForm>
        </View>
      ) : (
        <Host colorScheme="dark" style={{ flex: 1 }}>
          <NavigationStack>
            <Toolbar>
              <Form modifiers={[navigationTitle(title)]}>{children}</Form>
              <Toolbar.Content>
                <ToolbarItem placement="confirmationAction">
                  <Button label="Done" onPress={() => !busy && onClose()} />
                </ToolbarItem>
              </Toolbar.Content>
            </Toolbar>
          </NavigationStack>
        </Host>
      )}
    </Modal>
  );
}

export function ApplePicker<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  const picker = (
    <Picker
      label={label}
      selection={value}
      onSelectionChange={onChange}
      modifiers={[pickerStyle('menu')]}
    >
      {options.map(([value, label]) => (
        <Text key={value} modifiers={[tag(value)]}>
          {label}
        </Text>
      ))}
    </Picker>
  );
  return isTV ? (
    <LabeledContent label={label}>{picker}</LabeledContent>
  ) : (
    picker
  );
}

export function AppleTextField({
  label,
  value,
  onChange,
  secret,
  url,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
  url?: boolean;
  numeric?: boolean;
}) {
  const text = useNativeState(value);
  const lastValue = useRef(value);
  useEffect(() => {
    if (lastValue.current !== value) {
      lastValue.current = value;
      text.set(value);
    }
  }, [value, text]);
  const Field = secret ? SecureField : TextField;
  return (
    <Field
      placeholder={label}
      text={text}
      onTextChange={(next) => {
        lastValue.current = next;
        onChange(next);
      }}
      modifiers={[
        accessibilityLabel(label),
        autocorrectionDisabled(),
        textInputAutocapitalization('never'),
        ...(url
          ? [keyboardType('url')]
          : numeric
            ? [keyboardType('decimal-pad')]
            : []),
      ]}
    />
  );
}
