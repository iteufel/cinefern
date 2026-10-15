import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useApp } from '../app-context';
import { colors } from './theme';
import { useT } from './i18n';
import { Button } from './components';

export function IOSWelcome() {
  const app = useApp();
  const t = useT();
  const features: [SymbolViewProps['name'], string, string][] = [
    ['play.rectangle', t.welcomeWatch, t.welcomeWatchDescription],
    ['square.stack.3d.up', t.welcomeProviders, t.welcomeProvidersDescription],
    ['arrow.down.circle', t.welcomeOffline, t.welcomeOfflineDescription],
  ];
  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.language}>
          {(['en', 'de'] as const).map((language) => (
            <Pressable
              key={language}
              accessibilityRole="button"
              accessibilityState={{
                selected: app.state.settings.language === language,
              }}
              onPress={() => app.library.setSettings({ language })}
              style={s.languageButton}
            >
              <Text
                style={{
                  color:
                    app.state.settings.language === language
                      ? colors.accent
                      : colors.muted,
                  fontSize: 15,
                }}
              >
                {language === 'en' ? 'English' : 'Deutsch'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={s.main}>
          <Image
            source={require('../../assets/icon.png')}
            style={s.icon}
            accessibilityIgnoresInvertColors
          />
          <Text accessibilityRole="header" style={s.title}>
            {t.welcomeToCinefern}
          </Text>
          <Text style={s.subtitle}>{t.welcomeDescription}</Text>
          <View style={s.features}>
            {features.map(([name, title, description]) => (
              <View key={title} style={s.feature}>
                <SymbolView
                  name={name}
                  size={30}
                  tintColor={colors.accent}
                  style={s.symbol}
                />
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={s.featureTitle}>{title}</Text>
                  <Text style={s.description}>{description}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        <View style={s.bottom}>
          <Button
            variant="primary"
            onPress={() => app.library.update({ setupComplete: true })}
            style={{ alignSelf: 'center' }}
          >
            {t.getStarted}
          </Button>
          <Text style={s.footer}>Cinefern · Open source</Text>
          {!!app.state.persistenceError && (
            <Text style={s.error}>{app.state.persistenceError}</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 16,
    alignItems: 'center',
  },
  language: { flexDirection: 'row', alignSelf: 'flex-end', gap: 8 },
  languageButton: {
    minHeight: 44,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  main: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    maxWidth: 440,
    paddingVertical: 30,
  },
  icon: { width: 88, height: 88, borderRadius: 21, marginBottom: 26 },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 14,
  },
  features: { gap: 28, marginTop: 40, width: '100%' },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  symbol: { width: 36, height: 36 },
  featureTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
  description: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  bottom: { width: '100%', maxWidth: 440, gap: 18 },
  footer: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  error: { color: colors.warning, fontSize: 15 },
});
