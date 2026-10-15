import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  BackHandler,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TVFocusGuideView,
  View,
  useWindowDimensions,
} from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useApp, type Route } from '../app-context';
import { colors } from './theme';
import { useT } from './i18n';
import { Pressable, useTVBackHandling } from './focus';
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
  children,
  root,
}: {
  children: React.ReactNode;
  root: TVRoot;
}) {
  const app = useApp();
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const content = useRef<React.ElementRef<typeof TVFocusGuideView>>(null);
  const selected = useRef<View | null>(null);
  const tabs: Array<{
    root: TVRoot;
    route: Route;
    title: string;
    symbol: SFSymbol;
  }> = [
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
  // At a root, Back opens navigation. Once navigation has focus, the next Back
  // belongs to tvOS and returns to the system Home screen.
  useTVBackHandling(!expanded || app.canGoBack);
  useEffect(() => {
    if (app.playback) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (app.canGoBack) {
        app.back();
        return true;
      }
      if (expanded) return false;
      selected.current?.requestTVFocus();
      setExpanded(true);
      return true;
    });
    return () => listener.remove();
  }, [app.playback, app.canGoBack, app.back, expanded]);
  const enterContent = useCallback(() => setExpanded(false), []);
  return (
    <View style={s.root}>
      <TVFocusMemory.Provider value={enterContent}>
        <TVFocusGuideView ref={content} autoFocus style={s.content}>
          {children}
        </TVFocusGuideView>
      </TVFocusMemory.Provider>
      <TVFocusGuideView
        autoFocus
        trapFocusLeft
        trapFocusUp
        trapFocusDown
        style={[s.sidebar, { width: expanded ? 282 : 82 }]}
      >
        <NativeGlass style={s.sidebarGlass}>
          <View style={s.sidebarBrand}>
            <Image
              source={require('../../assets/icon.png')}
              style={s.sidebarIcon}
            />
            {expanded && <Text style={s.sidebarTitle}>Cinefern</Text>}
          </View>
          <View style={s.navigation}>
            {tabs.map((tab) => (
              <Pressable
                key={tab.root}
                ref={(view) => {
                  if (root === tab.root) selected.current = view;
                }}
                accessibilityRole="tab"
                accessibilityLabel={tab.title}
                accessibilityState={{ selected: root === tab.root }}
                onFocus={() => setExpanded(true)}
                onPress={() => {
                  app.navigate(tab.route);
                  setExpanded(false);
                  requestAnimationFrame(() =>
                    content.current?.requestTVFocus(),
                  );
                }}
                style={[
                  s.navItem,
                  root === tab.root && s.navSelected,
                  tab.root === 'settings' && { marginTop: 24 },
                ]}
              >
                <SymbolView
                  name={tab.symbol}
                  size={27}
                  tintColor="#fff"
                  style={s.navSymbol}
                />
                {expanded && (
                  <Text numberOfLines={1} style={s.navLabel}>
                    {tab.title}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        </NativeGlass>
      </TVFocusGuideView>
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
}: {
  children: React.ReactNode;
  active: boolean;
  immersive?: boolean;
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
      else guide.current?.requestTVFocus();
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
            <ScrollView
              removeClippedSubviews={false}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => {
                if (active && !lastFocus.current)
                  guide.current?.requestTVFocus();
              }}
              contentContainerStyle={immersive ? s.immersive : s.page}
            >
              {children}
            </ScrollView>
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
  content: { flex: 1 },
  frame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  page: {
    paddingLeft: 184,
    paddingRight: 52,
    paddingTop: 56,
    paddingBottom: 90,
  },
  immersive: { paddingBottom: 80 },
  sidebar: {
    position: 'absolute',
    top: 50,
    bottom: 50,
    left: 26,
    zIndex: 10,
    justifyContent: 'center',
  },
  sidebarGlass: {
    borderRadius: 30,
    paddingVertical: 22,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  sidebarBrand: {
    height: 62,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 22,
  },
  sidebarIcon: { height: 42, width: 42, borderRadius: 12 },
  sidebarTitle: {
    color: '#fff',
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  navigation: { gap: 12 },
  navItem: {
    minHeight: 62,
    borderRadius: 18,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  navSelected: { backgroundColor: '#ffffff22' },
  navSymbol: { width: 27, height: 27 },
  navLabel: { color: '#fff', fontSize: 23, fontWeight: '600', flexShrink: 1 },
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
