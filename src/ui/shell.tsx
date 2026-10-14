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
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp, type Route } from '../app-context';
import { colors } from './theme';
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
        style={[s.nav, selected && s.navSelected]}
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
              <Text style={[s.group, { marginTop: 27 }]}>{t.library}</Text>
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
                  OPEN SOURCE. OPEN POSSIBILITIES.
                </Text>
              </View>
            </View>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View
            style={[s.toolbar, mobile && { paddingHorizontal: 18, height: 67 }]}
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
                <Text style={s.breadcrumb}>Your cinema, your way.</Text>
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
                  backgroundColor: colors.background,
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
              { padding: mobile ? 20 : 36, paddingBottom: 50 },
            ]}
          >
            <View
              style={{ width: '100%', maxWidth: 1480, alignSelf: 'center' }}
            >
              {children}
            </View>
            <View style={s.footer}>
              <Text style={s.footerText}>CINEFERN 5.0</Text>
              <View style={s.footerLine} />
              <Text style={s.footerText}>A SPACE FOR EVERY STORY</Text>
            </View>
          </ScrollView>
        </View>
      </View>
      {mobile && (
        <View style={s.mobileNav}>
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
                onPress={() => app.navigate({ name } as Route)}
                style={s.mobileTab}
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
          style={[s.toast, mobile && { bottom: 85, left: 20, right: 20 }]}
        >
          <Text style={{ color: colors.text, fontSize: 13 }}>{app.toast}</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}
export function useContentWidth() {
  const { width } = useWindowDimensions();
  return Math.min(1480, width - (width >= 820 ? 298 : 40));
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  row: { flex: 1, flexDirection: 'row' },
  sidebar: {
    width: 226,
    backgroundColor: colors.sidebar,
    borderRightColor: colors.border,
    borderRightWidth: 1,
  },
  brand: { paddingHorizontal: 25, paddingVertical: 30, marginBottom: 10 },
  logoMark: {
    width: 33,
    height: 33,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -1.2,
  },
  group: {
    color: colors.subtle,
    fontSize: 9,
    letterSpacing: 1.6,
    fontWeight: '600',
    marginLeft: 13,
    marginBottom: 13,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 13,
    paddingVertical: 13,
    borderRadius: 8,
    marginBottom: 3,
  },
  navSelected: { backgroundColor: '#20352d' },
  navText: { color: colors.muted, fontSize: 13, fontWeight: '500', flex: 1 },
  count: {
    color: colors.accent,
    fontSize: 10,
    backgroundColor: colors.accentDark,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 26,
    marginHorizontal: 13,
  },
  providerMark: { width: 7, height: 7, borderRadius: 3, marginHorizontal: 5 },
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
    fontSize: 6.5,
    letterSpacing: 0.7,
    fontWeight: '600',
  },
  toolbar: {
    height: 82,
    paddingHorizontal: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#1c242e',
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
    marginTop: 55,
  },
  footerText: { color: colors.subtle, fontSize: 8, letterSpacing: 1.5 },
  footerLine: { flex: 1, height: 1, backgroundColor: '#202832' },
  mobileNav: {
    flexDirection: 'row',
    backgroundColor: colors.sidebar,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 12,
  },
  mobileTab: { flex: 1, alignItems: 'center', gap: 5 },
  mobileLabel: { fontSize: 9, color: colors.muted },
  toast: {
    position: 'absolute',
    bottom: 28,
    right: 28,
    maxWidth: 470,
    padding: 18,
    backgroundColor: colors.raised,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#466052',
  },
});
