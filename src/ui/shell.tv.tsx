import { Host, TabView } from '@expo/ui/swift-ui';
import { tabViewStyle } from '@expo/ui/swift-ui/modifiers';
import React, { useCallback, useContext, useEffect, useRef } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TVFocusGuideView,
  View,
  useWindowDimensions,
} from 'react-native';
import { type SFSymbol } from 'expo-symbols';
import { useApp, type Route } from '../app-context';
import { colors } from './theme';
import { useT } from './i18n';
import { NativeGlass } from './glass-view';
import { TVFocusMemory } from './focus-memory';
import { ScreenLayoutContext } from './screen-layout';
import type { TVRoot } from './tv-navigation';

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <View style={s.brand}>
      <Image source={require('../../assets/icon.png')} style={s.icon} />
      <Text style={[s.wordmark, small && { fontSize: 26 }]}>Cinefern</Text>
    </View>
  );
}
// Kept for the shared app's loading boundary; TV navigation uses TVShell below.
export function Shell({ children }: { children: React.ReactNode }) {
  return <View style={s.root}>{children}</View>;
}

export function TVShell({
  root,
  renderRoot,
}: {
  root: TVRoot;
  renderRoot: (root: TVRoot) => React.ReactNode;
}) {
  const app = useApp();
  const t = useT();
  const tabs: {
    root: TVRoot;
    route: Route;
    title: string;
    symbol: SFSymbol;
  }[] = [
    {
      root: 'search',
      route: { name: 'search' },
      title: t.search,
      symbol: 'magnifyingglass',
    },
    {
      root: 'home',
      route: { name: 'home' },
      title: t.discover,
      symbol: 'house.fill',
    },
    {
      root: 'library',
      route: { name: 'watchlist' },
      title: t.libraryTitle,
      symbol: 'rectangle.stack.fill',
    },
    {
      root: 'providers',
      route: { name: 'providers' },
      title: t.providers,
      symbol: 'square.stack.3d.up.fill',
    },
    {
      root: 'settings',
      route: { name: 'settings' },
      title: t.settings,
      symbol: 'gearshape.fill',
    },
  ];
  return (
    <View style={s.root}>
      <Host style={{ flex: 1 }} colorScheme="dark" ignoreSafeArea="container">
        <TabView
          selection={root}
          onSelectionChange={(value) => {
            const tab = tabs.find((tab) => tab.root === value);
            if (tab && value !== root) app.navigate(tab.route);
          }}
          modifiers={[tabViewStyle({ type: 'sidebarAdaptable' })]}
        >
          {tabs.map((tab) => (
            <TabView.Tab
              key={tab.root}
              value={tab.root}
              label={tab.title}
              systemImage={tab.symbol}
            >
              {renderRoot(tab.root)}
            </TabView.Tab>
          ))}
        </TabView>
      </Host>
      {!!app.toast && (
        <NativeGlass
          accessibilityLiveRegion="polite"
          pointerEvents="none"
          style={s.toast}
        >
          <Text style={s.toastText}>{app.toast}</Text>
        </NativeGlass>
      )}
    </View>
  );
}

// Each screen stays mounted while a detail page covers it. UIKit focus guides
// and this reference restore the exact card, including its shelf scroll offset.
export function TVScreenFrame({
  children,
  active,
  immersive,
  scrolls = true,
}: {
  children: React.ReactNode;
  active: boolean;
  immersive?: boolean;
  scrolls?: boolean;
}) {
  const playing = !!useApp().playback;
  const parentRemember = useContext(TVFocusMemory);
  const lastFocus = useRef<View | null>(null);
  const guide = useRef<React.ElementRef<typeof TVFocusGuideView>>(null);
  const width = Math.max(
    0,
    useWindowDimensions().width - 132 - (immersive ? 0 : 104),
  );
  const remember = useCallback(
    (view: View | null) => {
      lastFocus.current = view;
      parentRemember(view);
    },
    [parentRemember],
  );
  useEffect(() => {
    if (!active || playing) return;
    const frame = requestAnimationFrame(() => {
      if (lastFocus.current) lastFocus.current.requestTVFocus();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, playing]);
  return (
    <View
      style={[s.frame, !active && { display: 'none' }]}
      pointerEvents={active ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
    >
      <TVFocusMemory.Provider value={remember}>
        <ScreenLayoutContext.Provider
          value={{ nativeHeader: false, contentWidth: width }}
        >
          <TVFocusGuideView ref={guide} autoFocus style={{ flex: 1 }}>
            {!scrolls ? (
              <View style={[s.page, { flex: 1 }]}>{children}</View>
            ) : (
              <ScrollView
                removeClippedSubviews={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={immersive ? s.immersive : s.page}
              >
                {children}
              </ScrollView>
            )}
          </TVFocusGuideView>
        </ScreenLayoutContext.Provider>
      </TVFocusMemory.Provider>
    </View>
  );
}
export function useContentWidth() {
  const measured = useContext(ScreenLayoutContext).contentWidth;
  const { width } = useWindowDimensions();
  return measured || Math.max(0, width - 236);
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  frame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  page: {
    paddingLeft: 80,
    paddingRight: 80,
    paddingTop: 140,
    paddingBottom: 90,
  },
  immersive: { paddingBottom: 80 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  icon: { width: 58, height: 58, borderRadius: 16 },
  wordmark: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1,
  },
  toast: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    maxWidth: '75%',
    paddingHorizontal: 30,
    paddingVertical: 20,
    borderRadius: 22,
  },
  toastText: { fontSize: 24, color: '#fff', textAlign: 'center' },
});
