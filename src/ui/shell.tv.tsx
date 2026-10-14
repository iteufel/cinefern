import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TVFocusGuideView,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Bookmark,
  Compass,
  Download,
  History,
  Layers,
  Play,
  Search,
  Settings2,
  type LucideIcon,
} from 'lucide-react-native';
import { useApp, type Route } from '../app-context';
import { colors, radius } from './theme';
import { useT } from './i18n';
import { Button } from './components';
import { Pressable } from './focus';

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <View style={s.brand}>
      <View style={s.mark}>
        <Play size={26} color={colors.background} fill={colors.background} />
      </View>
      <Text style={[s.logo, small && { fontSize: 26 }]}>
        cine<Text style={{ color: colors.accent }}>fern</Text>
      </Text>
      <Text style={s.tv}>TV</Text>
    </View>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const t = useT();
  const tabs: [Route['name'], LucideIcon, string][] = [
    ['home', Compass, t.discover],
    ['search', Search, t.search],
    ['watchlist', Bookmark, t.watchlist],
    ['downloads', Download, t.downloads],
    ['history', History, t.history],
    ['providers', Layers, t.providers],
    ['settings', Settings2, t.settings],
  ];
  const routeKey = JSON.stringify(app.route);
  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Logo />
        <TVFocusGuideView autoFocus style={{ flex: 1 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.navigation}
          >
            {tabs.map(([name, Icon, label]) => (
              <Pressable
                key={name}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected: app.route.name === name }}
                hasTVPreferredFocus={
                  name === 'home' && app.route.name === 'home'
                }
                onPress={() =>
                  app.route.name !== name && app.navigate({ name } as Route)
                }
                style={[s.tab, app.route.name === name && s.selected]}
              >
                <Icon
                  size={24}
                  color={app.route.name === name ? colors.accent : colors.muted}
                />
                <Text
                  style={[
                    s.tabText,
                    app.route.name === name && { color: colors.accent },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </TVFocusGuideView>
      </View>
      <TVFocusGuideView autoFocus key={routeKey} style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.content}
        >
          {app.canGoBack && (
            <Button
              icon={ArrowLeft}
              variant="ghost"
              onPress={app.back}
              style={{ alignSelf: 'flex-start', marginBottom: 16 }}
            >
              {t.back}
            </Button>
          )}
          {children}
          <Text style={s.hint}>
            Select to open · Hold a title to save · Back to return
          </Text>
        </ScrollView>
      </TVFocusGuideView>
      {!!app.toast && (
        <View
          accessibilityLiveRegion="polite"
          pointerEvents="none"
          style={s.toast}
        >
          <Text style={s.toastText}>{app.toast}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

export function useContentWidth() {
  const { left, right } = useSafeAreaInsets();
  return Math.max(0, useWindowDimensions().width - left - right - 144);
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 32,
    paddingHorizontal: 52,
    paddingVertical: 22,
    backgroundColor: colors.background,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: {
    width: 48,
    height: 48,
    borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    fontSize: 32,
    color: colors.text,
    fontWeight: '700',
    letterSpacing: -1.5,
  },
  tv: { fontSize: 16, letterSpacing: 2, color: colors.muted },
  navigation: { gap: 12, padding: 8 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderRadius: radius.pill,
    borderColor: 'transparent',
  },
  selected: { backgroundColor: colors.raised },
  tabText: { fontSize: 22, color: colors.muted, fontWeight: '600' },
  content: { paddingHorizontal: 72, paddingTop: 34, paddingBottom: 70 },
  hint: { color: colors.subtle, fontSize: 20, marginTop: 40 },
  toast: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    maxWidth: '80%',
    paddingHorizontal: 30,
    paddingVertical: 20,
    borderRadius: radius.hero,
    backgroundColor: colors.raised,
    borderColor: '#ffffff24',
    borderWidth: 1,
  },
  toastText: { fontSize: 24, color: colors.text, textAlign: 'center' },
});
