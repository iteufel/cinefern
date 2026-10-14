import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  ArrowLeft,
  Bookmark,
  ChevronDown,
  Clapperboard,
  Compass,
  Download,
  Film,
  History,
  Layers,
  Play,
  Plus,
  Search,
  Settings2,
  Tv,
  type LucideIcon,
} from 'lucide-react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useApp, type Route } from '../app-context';
import { colors, glass, radius } from './theme';
import { useT } from './i18n';
import { Button, Input } from './components';

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={[s.logoMark, small && { width: 29, height: 29 }]}>
        <Play
          size={small ? 15 : 18}
          color={colors.background}
          fill={colors.background}
          strokeWidth={1.5}
        />
      </View>
      <Text style={[s.logo, small && { fontSize: 19 }]}>
        cine<Text style={{ color: colors.accent }}>fern</Text>
      </Text>
    </View>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const t = useT();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const mobile = width < 820;
  const nav = (
    name: Route['name'],
    icon: LucideIcon,
    title: string,
    filter?: 'movie' | 'series',
  ) => {
    const selected =
      app.route.name === name &&
      ('filter' in app.route ? app.route.filter === filter : !filter);
    const Icon = icon;
    return (
      <Pressable
        key={title}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ selected }}
        onPress={() => app.navigate({ name, filter } as Route)}
        style={({ pressed }) => [
          s.nav,
          selected && s.navSelected,
          pressed && s.navSelected,
        ]}
      >
        <Icon
          size={18}
          color={selected ? colors.accent : colors.muted}
          strokeWidth={1.7}
        />
        <Text style={[s.navText, selected && { color: colors.text }]}>
          {title}
        </Text>
        {name === 'watchlist' && app.state.watchlist.length > 0 && (
          <Text style={s.count}>{app.state.watchlist.length}</Text>
        )}
      </Pressable>
    );
  };
  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.row}>
        {!mobile && (
          <View style={s.sidebar}>
            <View style={s.brand}>
              <Logo />
            </View>
            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 17 }}
            >
              <Text style={s.group}>{t.explore}</Text>
              {nav('home', Compass, t.discover)}
              {nav('home', Film, t.movies, 'movie')}
              {nav('home', Tv, t.series, 'series')}
              {nav('search', Search, t.search)}
              <Text style={[s.group, { marginTop: 21 }]}>{t.library}</Text>
              {nav('watchlist', Bookmark, t.watchlist)}
              {nav('downloads', Download, t.downloads)}
              {nav('history', History, t.history)}
              <View style={s.divider} />
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={s.group}>{t.mediaProviders}</Text>
                <Button
                  icon={Plus}
                  variant="ghost"
                  compact
                  label="Manage providers"
                  onPress={() => app.navigate({ name: 'providers' })}
                />
              </View>
              {app.runtime
                .all()
                .filter(
                  (p) => !p.manifest.adult || app.state.settings.showAdult,
                )
                .map((provider) => (
                  <Pressable
                    key={provider.manifest.id}
                    accessibilityRole="button"
                    onPress={() =>
                      app.navigate({
                        name: 'home',
                        providerId: provider.manifest.id,
                      })
                    }
                    style={s.nav}
                  >
                    <View
                      style={[
                        s.providerMark,
                        {
                          backgroundColor:
                            provider.manifest.color ?? colors.accent,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        s.navText,
                        app.route.name === 'home' &&
                          app.route.providerId === provider.manifest.id && {
                            color: colors.accent,
                          },
                      ]}
                    >
                      {provider.manifest.name}
                    </Text>
                  </Pressable>
                ))}
              {nav('providers', Layers, t.providers)}
            </ScrollView>
            <View style={s.sidebarFooter}>
              {nav('settings', Settings2, t.settings)}
              <View style={s.status}>
                <View style={s.statusDot} />
                <Text style={s.statusText}>
                  Open source. Open possibilities.
                </Text>
              </View>
            </View>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View
            style={[s.toolbar, mobile && { paddingHorizontal: 20, height: 64 }]}
          >
            {mobile ? (
              <Logo small />
            ) : (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Button
                  icon={ArrowLeft}
                  variant="ghost"
                  compact
                  label={t.back}
                  disabled={!app.canGoBack}
                  onPress={app.back}
                />
                {width >= 1100 && (
                  <Text style={s.breadcrumb}>Your cinema, your way.</Text>
                )}
              </View>
            )}
            {!mobile && (
              <Input
                value={app.searchQuery}
                onChange={(value) => {
                  app.setSearchQuery(value);
                  if (app.route.name !== 'search')
                    app.navigate({ name: 'search' });
                }}
                placeholder={t.searchPlaceholder}
                icon={Search}
                style={{
                  width: Math.min(360, width * 0.3),
                  backgroundColor: colors.surface,
                }}
              />
            )}
            <Button
              icon={mobile ? Settings2 : Layers}
              variant="ghost"
              compact
              label={mobile ? t.settings : t.providers}
              onPress={() =>
                app.navigate({ name: mobile ? 'settings' : 'providers' })
              }
            >
              {!mobile ? (
                <Text style={{ color: colors.muted }}>Providers</Text>
              ) : undefined}
            </Button>
          </View>
          <ScrollView
            key={
              app.route.name +
              ('id' in app.route
                ? app.route.id
                : 'item' in app.route
                  ? app.route.item.id
                  : '')
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              s.content,
              { padding: mobile ? 20 : 32, paddingBottom: mobile ? 112 : 48 },
            ]}
          >
            <View
              style={{ width: '100%', maxWidth: 1400, alignSelf: 'center' }}
            >
              {children}
            </View>
            <View style={s.footer}>
              <Text style={s.footerText}>Cinefern 5.0</Text>
              <View style={s.footerLine} />
              <Text style={s.footerText}>A space for every story.</Text>
            </View>
          </ScrollView>
        </View>
      </View>
      {mobile && (
        <View style={[s.mobileNav, { bottom: Math.max(insets.bottom, 12) }]}>
          {[
            ['home', Compass, t.discover],
            ['search', Search, t.search],
            ['watchlist', Bookmark, t.watchlist],
            ['downloads', Download, t.downloads],
            ['providers', Layers, t.providers],
          ].map(([name, Icon, label]) => {
            const Symbol = Icon as LucideIcon;
            const selected = app.route.name === name;
            return (
              <Pressable
                key={String(name)}
                accessibilityRole="button"
                accessibilityLabel={String(label)}
                accessibilityState={{ selected }}
                onPress={() => app.navigate({ name } as Route)}
                style={({ pressed }) => [
                  s.mobileTab,
                  selected && s.mobileTabSelected,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Symbol
                  size={20}
                  color={selected ? colors.accent : colors.muted}
                  strokeWidth={1.7}
                />
                <Text
                  style={[s.mobileLabel, selected && { color: colors.accent }]}
                >
                  {String(label)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {!!app.toast && (
        <Pressable
          onPress={() => app.notify('')}
          style={[
            s.toast,
            mobile && {
              bottom: Math.max(insets.bottom, 12) + 82,
              left: 20,
              right: 20,
            },
          ]}
        >
          <Text style={{ color: colors.text, fontSize: 13 }}>{app.toast}</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}
export function useContentWidth() {
  const { width } = useWindowDimensions();
  return Math.min(1400, width - (width >= 820 ? 296 : 40));
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  row: { flex: 1, flexDirection: 'row' },
  sidebar: {
    width: 232,
    backgroundColor: colors.sidebar,
    borderRightColor: colors.border,
    borderRightWidth: 1,
  },
  brand: {
    paddingHorizontal: 27,
    paddingTop: 28,
    paddingBottom: 30,
    marginBottom: 4,
  },
  logoMark: {
    width: 33,
    height: 33,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: -1,
  },
  group: {
    color: colors.subtle,
    fontSize: 10,
    letterSpacing: 0.5,
    fontWeight: '600',
    marginLeft: 13,
    marginBottom: 10,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 12,
    marginBottom: 3,
  },
  navSelected: { backgroundColor: colors.selection },
  navText: { color: colors.muted, fontSize: 13, fontWeight: '500', flex: 1 },
  count: {
    color: colors.accent,
    fontSize: 10,
    backgroundColor: colors.selection,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 15,
    marginHorizontal: 13,
  },
  providerMark: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 5 },
  sidebarFooter: {
    paddingHorizontal: 17,
    paddingBottom: 22,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 13,
    marginTop: 13,
  },
  statusDot: {
    width: 4,
    height: 4,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  statusText: {
    color: colors.subtle,
    fontSize: 9,
    letterSpacing: 0,
    fontWeight: '400',
  },
  toolbar: {
    height: 72,
    paddingHorizontal: 28,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 15,
  },
  breadcrumb: {
    color: colors.subtle,
    fontSize: 12,
    alignSelf: 'center',
    marginLeft: 6,
  },
  content: { flexGrow: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginTop: 44,
  },
  footerText: { color: colors.subtle, fontSize: 10 },
  footerLine: { flex: 1, height: 1, backgroundColor: colors.separator },
  mobileNav: {
    ...glass,
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#ffffff1f',
    borderRadius: 28,
    padding: 6,
  },
  mobileTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    minHeight: 58,
    borderRadius: 22,
  },
  mobileTabSelected: { backgroundColor: '#ffffff10' },
  mobileLabel: { fontSize: 9, fontWeight: '500', color: colors.muted },
  toast: {
    position: 'absolute',
    bottom: 28,
    right: 28,
    maxWidth: 470,
    padding: 18,
    ...glass,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: '#ffffff24',
  },
});
