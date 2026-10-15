import React, { Component } from 'react';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, Code2, Monitor, Smartphone } from 'lucide-react-native';
import { AppProvider, useApp } from './src/app-context';
import { Shell, Logo } from './src/ui/shell';
import { Button, Chip, Loading, styles as ui } from './src/ui/components';
import { Dialog } from './src/ui/dialog';
import { colors, radius, isTV } from './src/ui/theme';
import { useT } from './src/ui/i18n';
import {
  HomeScreen,
  SearchScreen,
  CollectionScreen,
  PersonScreen,
} from './src/screens/browse';
import { DetailScreen } from './src/screens/detail';
import {
  WatchlistScreen,
  DownloadsScreen,
  HistoryScreen,
} from './src/screens/library';
import { ProvidersScreen } from './src/screens/providers';
import { SettingsScreen } from './src/screens/settings';
import { Player } from './src/player';
import { imageSource } from './src/ui/artwork';
import { NativeApplication, NativeWelcome } from './src/ui/native-experience';

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error?: string }
> {
  state: { error?: string } = {};
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    if (this.state.error)
      return (
        <View style={s.error}>
          <Text style={s.errorTitle}>Something went wrong</Text>
          <Text style={ui.muted}>{this.state.error}</Text>
          <Button onPress={() => this.setState({ error: undefined })}>
            Try again
          </Button>
        </View>
      );
    return this.props.children;
  }
}
export default function App() {
  return (
    <SafeAreaProvider>
      {Platform.OS !== 'ios' && !isTV && <StatusBar style="light" />}
      <ErrorBoundary>
        <AppProvider>
          <Application />
        </AppProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
function Application() {
  const app = useApp();
  if (!app.state.ready || !app.providersReady)
    return (
      <View style={s.loading}>
        <Logo />
        <Loading />
      </View>
    );
  if (!app.state.setupComplete)
    return NativeWelcome ? <NativeWelcome /> : <Welcome />;
  if (NativeApplication) return <NativeApplication />;
  const route = app.route;
  const modalDetails =
    !isTV &&
    route.name === 'item' &&
    app.state.settings.detailPresentation === 'modal';
  let content: React.ReactNode;
  switch (route.name) {
    case 'home':
      content = <HomeScreen />;
      break;
    case 'search':
      content = <SearchScreen />;
      break;
    case 'item':
      content = modalDetails ? <HomeScreen /> : <DetailScreen />;
      break;
    case 'collection':
      content = <CollectionScreen />;
      break;
    case 'person':
      content = <PersonScreen />;
      break;
    case 'watchlist':
      content = <WatchlistScreen />;
      break;
    case 'downloads':
      content = <DownloadsScreen />;
      break;
    case 'history':
      content = <HistoryScreen />;
      break;
    case 'providers':
      content = <ProvidersScreen />;
      break;
    case 'settings':
      content = <SettingsScreen />;
      break;
  }
  return (
    <>
      <Shell>{content}</Shell>
      {modalDetails && (
        <Dialog
          wide
          visible
          title={route.name === 'item' ? route.item.title : 'Details'}
          onClose={app.back}
        >
          <DetailScreen />
        </Dialog>
      )}
      <Player />
    </>
  );
}
function Welcome() {
  const app = useApp();
  const t = useT();
  const { width } = useWindowDimensions();
  return (
    <SafeAreaView style={s.welcome}>
      <ScrollView contentContainerStyle={s.welcomeScroll}>
        <View style={s.welcomeHeader}>
          <Logo />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip
              selected={app.state.settings.language === 'en'}
              onPress={() => app.library.setSettings({ language: 'en' })}
            >
              EN
            </Chip>
            <Chip
              selected={app.state.settings.language === 'de'}
              onPress={() => app.library.setSettings({ language: 'de' })}
            >
              DE
            </Chip>
          </View>
        </View>
        <View style={[s.welcomeMain, width < 820 && { paddingVertical: 45 }]}>
          <Text style={ui.eyebrow}>WELCOME TO CINEFERN</Text>
          <Text
            style={[
              s.welcomeTitle,
              width < 820 && { fontSize: 46, lineHeight: 51 },
            ]}
          >
            {t.welcome}
          </Text>
          <Text
            style={[
              s.welcomeDescription,
              isTV && { fontSize: 25, lineHeight: 36, maxWidth: 800 },
            ]}
          >
            {t.welcomeDescription}
          </Text>
          <Button
            variant="primary"
            preferredFocus={isTV}
            icon={ArrowRight}
            onPress={() => app.library.update({ setupComplete: true })}
            style={{ alignSelf: 'center', marginTop: 12 }}
          >
            {t.getStarted}
          </Button>
          <View style={s.featureRow}>
            {[
              [Monitor, 'Every desktop'],
              [Smartphone, 'Every pocket'],
              [Code2, 'Open by design'],
            ].map(([Icon, label]) => {
              const Symbol = Icon as typeof Monitor;
              return (
                <View key={String(label)} style={s.feature}>
                  <Symbol size={19} color={colors.accent} strokeWidth={1.5} />
                  <Text style={s.featureText}>{String(label)}</Text>
                </View>
              );
            })}
          </View>
          <View style={s.filmStrip}>
            {['asset:bunny', 'asset:sintel-backdrop', 'asset:tears'].map(
              (title, index) => (
                <View
                  key={title}
                  style={[
                    s.welcomeCard,
                    {
                      transform: [
                        {
                          translateY: index === 1 ? 0 : 12,
                        },
                      ],
                      marginTop: 0,
                    },
                  ]}
                >
                  <Image
                    source={imageSource(title)}
                    style={[
                      StyleSheet.absoluteFill,
                      { width: '100%', height: '100%' },
                    ]}
                    resizeMode="cover"
                  />
                  <LinearGradient
                    colors={['#00000000', '#10101266']}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
              ),
            )}
          </View>
        </View>
        <Text style={s.welcomeFooter}>
          WINDOWS · macOS · LINUX · iOS · ANDROID · APPLE TV
        </Text>
        <Text style={s.license}>Open source · AGPL-3.0-or-later</Text>
        {app.state.persistenceError && (
          <Text style={{ color: colors.warning }}>
            {app.state.persistenceError}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  welcome: { flex: 1, backgroundColor: colors.background },
  welcomeScroll: { flexGrow: 1, padding: 30, alignItems: 'center' },
  welcomeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    maxWidth: 1250,
  },
  welcomeMain: {
    flex: 1,
    width: '100%',
    maxWidth: 850,
    paddingVertical: 65,
    gap: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeTitle: {
    color: colors.text,
    fontSize: 74,
    lineHeight: 80,
    fontWeight: '700',
    letterSpacing: -3,
    textAlign: 'center',
    maxWidth: 680,
  },
  welcomeDescription: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 27,
    textAlign: 'center',
    maxWidth: 500,
  },
  featureRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 28,
    marginVertical: 10,
  },
  feature: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  featureText: { color: colors.muted, fontSize: 11 },
  filmStrip: {
    flexDirection: 'row',
    gap: 16,
    width: '100%',
    maxWidth: 680,
    height: 185,
    justifyContent: 'center',
    marginTop: 16,
  },
  welcomeCard: {
    flex: 1,
    maxWidth: 200,
    height: 155,
    overflow: 'hidden',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  welcomeFooter: { color: colors.subtle, fontSize: 9, letterSpacing: 2 },
  license: { color: colors.subtle, fontSize: 9, marginTop: 12 },
  error: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 25,
    gap: 20,
  },
  errorTitle: { color: colors.text, fontSize: 24 },
});
