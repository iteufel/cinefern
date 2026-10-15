import { Image, Text, View } from 'react-native';
import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { Play } from 'lucide-react-native';
import { useApp } from '../app-context';
import { Button } from './components';
import { useT } from './i18n';
import { colors } from './theme';

export function TVWelcome() {
  const app = useApp();
  const t = useT();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        padding: 80,
      }}
    >
      <Image
        source={require('../../assets/icon.png')}
        style={{ width: 140, height: 140, borderRadius: 32, marginBottom: 12 }}
      />
      <Text
        accessibilityRole="header"
        style={{
          color: colors.text,
          fontSize: 60,
          fontWeight: '700',
          textAlign: 'center',
        }}
      >
        {t.welcomeToCinefern}
      </Text>
      <Text
        style={{
          color: colors.muted,
          fontSize: 29,
          lineHeight: 40,
          textAlign: 'center',
          maxWidth: 820,
        }}
      >
        {t.welcomeProvidersDescription}
      </Text>
      <Button
        icon={Play}
        variant="primary"
        onPress={() => app.library.update({ setupComplete: true })}
      >
        {t.getStarted}
      </Button>
      <Host
        matchContents={{ vertical: true }}
        style={{ width: 400, marginTop: 20 }}
        colorScheme="dark"
      >
        <Picker
          selection={app.state.settings.language}
          onSelectionChange={(language: 'en' | 'de') =>
            app.library.setSettings({ language })
          }
          modifiers={[pickerStyle('segmented')]}
        >
          <SwiftText modifiers={[tag('en')]}>English</SwiftText>
          <SwiftText modifiers={[tag('de')]}>Deutsch</SwiftText>
        </Picker>
      </Host>
      {!!app.state.persistenceError && (
        <Text style={{ color: colors.warning, fontSize: 24 }}>
          {app.state.persistenceError}
        </Text>
      )}
    </View>
  );
}
