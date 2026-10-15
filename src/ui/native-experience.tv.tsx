import React, { useCallback, useState, type ComponentType } from 'react';
import { View } from 'react-native';
import { AppNavigationProvider, useApp, type Route } from '../app-context';
import { TVHomeScreen } from '../screens/tv-home';
import {
  SearchScreen,
  CollectionScreen,
  PersonScreen,
} from '../screens/browse';
import { DetailScreen } from '../screens/detail';
import {
  WatchlistScreen,
  DownloadsScreen,
  HistoryScreen,
} from '../screens/library';
import { ProvidersScreen } from '../screens/providers';
import { SettingsScreen } from '../screens/settings';
import { Player } from '../player';
import { Chip } from './components';
import { TVScreenFrame, TVShell } from './shell.tv';
import {
  initialTVNavigation,
  tvBack,
  tvNavigate,
  tvRoot,
} from './tv-navigation';
import { useT } from './i18n';

export function NativeApplication() {
  const [navigation, setNavigation] = useState(initialTVNavigation);
  const navigate = useCallback(
    (route: Route) => setNavigation((state) => tvNavigate(state, route)),
    [],
  );
  const back = useCallback(() => setNavigation(tvBack), []);
  const branch = navigation.branches[navigation.root]!;
  const current = branch[branch.length - 1]!;
  return (
    <AppNavigationProvider
      route={current.route}
      navigate={navigate}
      back={back}
      canGoBack={branch.length > 1}
      screenActive
    >
      <TVShell root={navigation.root}>
        {Object.values(navigation.branches).flatMap((frames) =>
          frames!.map((frame, i) => (
            <AppNavigationProvider
              key={frame.key}
              route={frame.route}
              navigate={navigate}
              back={back}
              canGoBack={i > 0}
              screenActive={frame.key === current.key}
            >
              <TVScreenFrame
                active={frame.key === current.key}
                immersive={frame.route.name === 'home'}
              >
                <TVScreen />
              </TVScreenFrame>
            </AppNavigationProvider>
          )),
        )}
      </TVShell>
      <Player />
    </AppNavigationProvider>
  );
}
function TVScreen() {
  const app = useApp();
  const t = useT();
  const route = app.route;
  let screen: React.ReactNode;
  switch (route.name) {
    case 'home':
      return <TVHomeScreen />;
    case 'search':
      return <SearchScreen />;
    case 'item':
      return <DetailScreen />;
    case 'collection':
      return <CollectionScreen />;
    case 'person':
      return <PersonScreen />;
    case 'providers':
      return <ProvidersScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'watchlist':
      screen = <WatchlistScreen />;
      break;
    case 'downloads':
      screen = <DownloadsScreen />;
      break;
    case 'history':
      screen = <HistoryScreen />;
      break;
  }
  return (
    <>
      {tvRoot(route) === 'library' && (
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 32 }}>
          {(['watchlist', 'history', 'downloads'] as const).map((name) => (
            <Chip
              key={name}
              selected={route.name === name}
              onPress={() => app.navigate({ name })}
            >
              {t[name]}
            </Chip>
          ))}
        </View>
      )}
      {screen}
    </>
  );
}
export const NativeWelcome: ComponentType | null = null;
