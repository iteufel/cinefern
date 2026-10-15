import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  createNavigationContainerRef,
  DarkTheme,
  NavigationContainer,
  StackActions,
  useIsFocused,
  useScrollToTop,
  type NavigatorScreenParams,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import {
  createNativeBottomTabNavigator,
  type NativeBottomTabScreenProps,
} from '@react-navigation/bottom-tabs/unstable';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppNavigationProvider, useApp, type Route } from '../app-context';
import {
  SearchScreen,
  CollectionScreen,
  PersonScreen,
} from '../screens/browse';
import { DetailScreen } from '../screens/detail';
import {
  DownloadsScreen,
  HistoryScreen,
  WatchlistScreen,
} from '../screens/library';
import { ProvidersScreen } from '../screens/providers';
import { SettingsScreen } from '../screens/settings';
import { Player } from '../player/apple';
import { IOSHomeScreen, IOSLibraryScreen } from '../screens/apple';
import { ScreenLayoutContext } from './screen-layout';
import { colors } from './theme';
import { useT } from './i18n';
import { appleNavigationAction } from './apple-navigation';

export { IOSWelcome as NativeWelcome } from './welcome.ios';

type TabParams = {
  Discover: { route?: Route } | undefined;
  Library: undefined;
  Providers: undefined;
  Search: undefined;
};
type StackParams = {
  Tabs: NavigatorScreenParams<TabParams> | undefined;
  Page: { route: Route };
  Sheet: { route: Route };
  Player: undefined;
};
const Stack = createNativeStackNavigator<StackParams>();
const Tabs = createNativeBottomTabNavigator<TabParams>();
const navigation = createNavigationContainerRef<StackParams>();
const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.separator,
  },
};

function SettingsButton() {
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.settings}
      onPress={() =>
        navigation.dispatch(
          StackActions.push('Page', { route: { name: 'settings' } }),
        )
      }
      style={({ pressed }) => [s.headerButton, pressed && { opacity: 0.5 }]}
    >
      <SymbolView
        name="person.crop.circle"
        size={27}
        tintColor={colors.accent}
      />
    </Pressable>
  );
}

function tabTitle(
  route: Route,
  t: ReturnType<typeof useT>,
  manifests: ReturnType<typeof useApp>['manifests'],
) {
  if (route.name === 'home')
    return route.providerId
      ? (manifests.find((m) => m.id === route.providerId)?.name ?? t.discover)
      : t.discover;
  if (route.name === 'item') return route.item.title;
  if (route.name === 'person' || route.name === 'collection')
    return route.title;
  return t[route.name];
}

function NativeTabs() {
  const t = useT();
  const app = useApp();
  return (
    <Tabs.Navigator
      backBehavior="none"
      screenOptions={{
        headerShown: true,
        headerLargeTitleEnabled: true,
        headerLargeTitleShadowVisible: false,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { color: colors.text },
        headerTintColor: colors.accent,
        headerRight: () => <SettingsButton />,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarControllerMode: 'tabSidebar',
      }}
    >
      <Tabs.Screen
        name="Discover"
        component={DiscoverTab}
        options={({ route }) => ({
          title: tabTitle(
            route.params?.route ?? { name: 'home' },
            t,
            app.manifests,
          ),
          tabBarLabel: t.discover,
          tabBarIcon: { type: 'sfSymbol', name: 'play.rectangle.fill' },
        })}
      />
      <Tabs.Screen
        name="Library"
        component={LibraryTab}
        options={{
          title: t.libraryTitle,
          tabBarIcon: { type: 'sfSymbol', name: 'rectangle.stack.fill' },
        }}
      />
      <Tabs.Screen
        name="Providers"
        component={ProvidersTab}
        options={{
          title: t.providers,
          tabBarIcon: { type: 'sfSymbol', name: 'square.stack.3d.up.fill' },
        }}
      />
      <Tabs.Screen
        name="Search"
        component={SearchTab}
        options={{
          title: t.search,
          tabBarLabel: t.search,
          tabBarSystemItem: 'search',
        }}
      />
    </Tabs.Navigator>
  );
}

function DiscoverTab({
  route,
}: NativeBottomTabScreenProps<TabParams, 'Discover'>) {
  return <RouteContent route={route.params?.route ?? { name: 'home' }} tab />;
}
function LibraryTab() {
  return <RouteContent route={{ name: 'watchlist' }} tab library />;
}
function ProvidersTab() {
  return <RouteContent route={{ name: 'providers' }} tab />;
}
function SearchTab() {
  return <RouteContent route={{ name: 'search' }} tab />;
}
function Page({
  route,
}: NativeStackScreenProps<StackParams, 'Page' | 'Sheet'>) {
  return <RouteContent route={route.params.route} />;
}

function PlaybackScreen() {
  return <Player embedded />;
}

function Screen({ route, library }: { route: Route; library?: boolean }) {
  if (library) return <IOSLibraryScreen />;
  switch (route.name) {
    case 'home':
      return <IOSHomeScreen />;
    case 'search':
      return <SearchScreen />;
    case 'watchlist':
      return <WatchlistScreen />;
    case 'downloads':
      return <DownloadsScreen />;
    case 'history':
      return <HistoryScreen />;
    case 'providers':
      return <ProvidersScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'item':
      return <DetailScreen />;
    case 'collection':
      return <CollectionScreen />;
    case 'person':
      return <PersonScreen />;
  }
}

function RouteContent({
  route,
  tab = false,
  library = false,
}: {
  route: Route;
  tab?: boolean;
  library?: boolean;
}) {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const scroll = useRef<ScrollView>(null);
  const [contentWidth, setContentWidth] = useState(0);
  useScrollToTop(scroll);
  function navigate(next: Route) {
    navigation.dispatch(
      appleNavigationAction(next, app.state.settings.detailPresentation),
    );
  }
  return (
    <AppNavigationProvider
      route={route}
      navigate={navigate}
      back={() => navigation.goBack()}
      canGoBack={!tab}
      screenActive={focused}
    >
      <ScreenLayoutContext.Provider
        value={{ nativeHeader: true, contentWidth }}
      >
        <View style={s.screen}>
          {route.name === 'settings' ||
          route.name === 'providers' ||
          library ? (
            <Screen route={route} library={library} />
          ) : (
            <ScrollView
              ref={scroll}
              contentInsetAdjustmentBehavior="automatic"
              automaticallyAdjustKeyboardInsets
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.content}
            >
              <View
                style={s.column}
                onLayout={(event) =>
                  setContentWidth(event.nativeEvent.layout.width)
                }
              >
                <Screen route={route} library={library} />
              </View>
            </ScrollView>
          )}
          {!!app.toast && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={app.toast}
              onPress={() => app.notify('')}
              style={[s.toast, { bottom: insets.bottom + (tab ? 80 : 16) }]}
            >
              <Text style={s.toastText}>{app.toast}</Text>
            </Pressable>
          )}
        </View>
      </ScreenLayoutContext.Provider>
    </AppNavigationProvider>
  );
}

export function NativeApplication() {
  const app = useApp();
  const t = useT();
  const playing = !!app.playback;
  useEffect(() => {
    if (!navigation.isReady()) return;
    const playerVisible = navigation.getCurrentRoute()?.name === 'Player';
    if (playing && !playerVisible) navigation.navigate('Player');
    else if (!playing && playerVisible) navigation.goBack();
  }, [playing]);
  useEffect(() => {
    if (app.toast) AccessibilityInfo.announceForAccessibility(app.toast);
  }, [app.toast]);
  return (
    <>
      <NavigationContainer ref={navigation} theme={theme}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            contentStyle: { backgroundColor: colors.background },
            headerTintColor: colors.accent,
            headerTitleStyle: { color: colors.text },
            headerBackButtonDisplayMode: 'minimal',
            headerShadowVisible: false,
            gestureEnabled: true,
            statusBarStyle: 'light',
            statusBarHidden: false,
          }}
        >
          <Stack.Screen
            name="Tabs"
            component={NativeTabs}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Page"
            component={Page}
            options={({ route }) => ({
              title: tabTitle(route.params.route, t, app.manifests),
              headerLargeTitleEnabled: route.params.route.name !== 'item',
            })}
          />
          <Stack.Screen
            name="Sheet"
            component={Page}
            options={({ route }) => ({
              title: tabTitle(route.params.route, t, app.manifests),
              presentation: 'modal',
              headerRight: () => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => navigation.goBack()}
                  style={s.headerButton}
                >
                  <Text style={s.done}>{t.done}</Text>
                </Pressable>
              ),
            })}
          />
          <Stack.Screen
            name="Player"
            component={PlaybackScreen}
            options={{
              presentation: 'fullScreenModal',
              animation: 'fade',
              headerShown: false,
              gestureEnabled: false,
              statusBarHidden: true,
              autoHideHomeIndicator: true,
            }}
            listeners={{ beforeRemove: () => app.setPlayback(null) }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    flexGrow: 1,
  },
  column: { width: '100%', maxWidth: 1000, alignSelf: 'center' },
  headerButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  done: { color: colors.accent, fontSize: 17, fontWeight: '600' },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    width: '90%',
    maxWidth: 440,
    backgroundColor: colors.raised,
    borderRadius: 16,
    padding: 18,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toastText: { color: colors.text, fontSize: 15, textAlign: 'center' },
});
