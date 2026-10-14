import { Toggle } from '../ui/focus';
import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Code2,
  ExternalLink,
  FilePlus2,
  Globe,
  Layers,
  Plus,
  Settings2,
  ShieldCheck,
  Trash2,
} from 'lucide-react-native';
import {
  parseBundle,
  type ProviderBundle,
  type ProviderManifest,
  type SettingValue,
} from '@cinefern/provider-sdk';
import { useApp } from '../app-context';
import { platform } from '../platform';
import {
  Button,
  Chip,
  Input,
  PageHeader,
  styles as ui,
} from '../ui/components';
import { Dialog, ConfirmDialog } from '../ui/dialog';
import { colors, radius, isTV, textSize } from '../ui/theme';
import { useT } from '../ui/i18n';
import { fetchTextDocument } from '../core/import-document';
import { jellyfinManifest } from '../providers/jellyfin';

export function ProvidersScreen() {
  const app = useApp();
  const t = useT();
  const compact = useWindowDimensions().width < 600;
  const [pending, setPending] = useState<ProviderBundle | null>(null);
  const [editing, setEditing] = useState<ProviderManifest | null>(null);
  const [values, setValues] = useState<Record<string, SettingValue>>({});
  const [remove, setRemove] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [urlDialog, setUrlDialog] = useState(false);
  const [bundleUrl, setBundleUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const isJellyfin = editing?.id === jellyfinManifest.id;
  const jellyfinConnected =
    !!app.state.providerSettings[jellyfinManifest.id]?.userId;
  function closeSettings() {
    if (busy) return;
    setEditing(null);
    setValues({});
    setSettingsError('');
  }
  async function loadUrl() {
    setBusy(true);
    setUrlError('');
    try {
      const text = await fetchTextDocument(bundleUrl, (url) =>
        platform.request(url),
      );
      const bundle = parseBundle(text);
      setUrlDialog(false);
      setPending(bundle);
    } catch (error) {
      setUrlError(String(error).replace(/^Error: /, ''));
      app.notify(String(error).replace(/^Error: /, ''));
    } finally {
      setBusy(false);
    }
  }
  async function chooseFile() {
    try {
      const file = await platform.readTextFile();
      if (file) setPending(parseBundle(file.text));
    } catch (error) {
      app.notify(String(error).replace(/^Error: /, ''));
    }
  }
  async function edit(manifest: ProviderManifest) {
    const defaults = Object.fromEntries(
      (manifest.settings ?? []).map((s) => [s.id, s.default ?? '']),
    );
    const settings =
      app.state.providerSettings[manifest.id] ??
      app.state.plugins.find((p) => p.bundle.manifest.id === manifest.id)
        ?.settings ??
      {};
    setValues({ ...defaults, ...settings });
    setSettingsError('');
    setEditing(manifest);
  }
  async function saveSettings() {
    if (!editing) return;
    setBusy(true);
    setSettingsError('');
    try {
      await app.updateProviderSettings(editing.id, values);
      setEditing(null);
      setValues({});
    } catch (error) {
      setSettingsError(String(error).replace(/^Error: /, ''));
      app.notify(String(error).replace(/^Error: /, ''));
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setSettingsError('');
    try {
      await app.disconnectJellyfin();
      setEditing(null);
      setValues({});
    } catch (error) {
      setSettingsError(String(error).replace(/^Error: /, ''));
    } finally {
      setBusy(false);
    }
  }
  async function install() {
    if (!pending) return;
    setBusy(true);
    setUrlError('');
    try {
      await app.installPlugin(pending);
      setPending(null);
    } catch (error) {
      setUrlError('Could not install provider: ' + String(error));
      app.notify('Could not install provider: ' + String(error));
    } finally {
      setBusy(false);
    }
  }
  const resolvers = app.manifests
    .filter((m) => m.capabilities.includes('resolve'))
    .sort(
      (a, b) =>
        (app.state.resolverOrder.indexOf(a.id) < 0
          ? 999
          : app.state.resolverOrder.indexOf(a.id)) -
        (app.state.resolverOrder.indexOf(b.id) < 0
          ? 999
          : app.state.resolverOrder.indexOf(b.id)),
    );
  function move(id: string, offset: number) {
    const ids = resolvers.map((m) => m.id);
    const index = ids.indexOf(id);
    const target = index + offset;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    app.library.update({ resolverOrder: ids });
  }
  return (
    <>
      <PageHeader
        title={t.providers}
        eyebrow="YOUR WORLD. YOUR SOURCES."
        description="Connect the places your stories come from. Every provider speaks the same open TypeScript API."
        action={
          <Button
            icon={Plus}
            variant="primary"
            onPress={() => (isTV ? setUrlDialog(true) : void chooseFile())}
          >
            {t.install}
          </Button>
        }
      />
      <View
        style={[
          s.intro,
          compact && { flexDirection: 'column', alignItems: 'flex-start' },
        ]}
      >
        <View style={s.introIcon}>
          <Code2 size={25} color={colors.accent} />
        </View>
        <View style={{ flex: compact ? undefined : 1, gap: 8 }}>
          <Text style={s.introTitle}>A player that stays open.</Text>
          <Text style={s.description}>
            Write a provider in TypeScript, build a .cfprovider bundle, and use
            it on every platform. Browsing, search, episodes, and playback are
            yours to extend.
          </Text>
        </View>
      </View>
      {!isTV && (
        <Button
          icon={Globe}
          onPress={() => setUrlDialog(true)}
          style={{ alignSelf: 'flex-start', marginBottom: 20 }}
        >
          Install from URL
        </Button>
      )}
      <View style={{ gap: 16 }}>
        {app.manifests.map((manifest) => {
          const plugin = app.state.plugins.find(
            (p) => p.bundle.manifest.id === manifest.id,
          );
          const enabled =
            !app.state.disabledProviders.includes(manifest.id) &&
            (plugin?.enabled ?? true);
          const record = app.runtime
            .all()
            .find((p) => p.manifest.id === manifest.id);
          return (
            <View
              key={manifest.id}
              style={[s.card, compact && { padding: 20 }]}
            >
              <View style={s.cardHeader}>
                <View
                  style={[
                    s.providerIcon,
                    {
                      backgroundColor: (manifest.color ?? colors.accent) + '18',
                    },
                  ]}
                >
                  <Layers
                    size={23}
                    color={manifest.color ?? colors.accent}
                    strokeWidth={1.6}
                  />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <Text style={s.name}>{manifest.name}</Text>
                    <Text style={s.version}>v{manifest.version}</Text>
                  </View>
                  <Text style={ui.muted}>
                    {plugin ? 'Community provider' : 'Included with Cinefern'} ·{' '}
                    {manifest.author}
                  </Text>
                </View>
                <Toggle
                  accessibilityLabel={'Enable ' + manifest.name}
                  value={enabled}
                  trackColor={{ false: colors.border, true: '#355848' }}
                  thumbColor={enabled ? colors.accent : colors.muted}
                  onValueChange={(value) =>
                    void app
                      .setEnabled(manifest.id, value)
                      .catch((error) => app.notify(String(error)))
                  }
                />
              </View>
              <Text style={s.description}>{manifest.description}</Text>
              {manifest.id === jellyfinManifest.id && (
                <Text style={s.description}>
                  {jellyfinConnected
                    ? 'Saved connection · ' +
                      app.state.providerSettings[manifest.id]?.username
                    : 'Add your server address and Jellyfin account to get started.'}
                </Text>
              )}
              {record?.error && (
                <Text style={{ color: colors.warning, fontSize: textSize(13) }}>
                  {record.error}
                </Text>
              )}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 7 }}
              >
                {manifest.capabilities.map((c) => (
                  <View key={c} style={s.capability}>
                    <Text style={s.capabilityText}>{c}</Text>
                  </View>
                ))}
              </ScrollView>
              <View style={s.cardFooter}>
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 6,
                    alignItems: 'center',
                    flex: 1,
                  }}
                >
                  <ShieldCheck size={13} color={colors.subtle} />
                  <Text style={s.permission}>
                    {
                      (
                        record?.manifest.permissions.network ??
                        manifest.permissions.network
                      ).length
                    }{' '}
                    network origins
                    {manifest.permissions.agent !== undefined
                      ? ' · Agent access requested'
                      : ''}
                  </Text>
                </View>
                <Button
                  icon={Settings2}
                  compact
                  onPress={() => void edit(manifest)}
                >
                  {manifest.id === jellyfinManifest.id && !jellyfinConnected
                    ? 'Connect'
                    : t.settings}
                </Button>
                {plugin && (
                  <Button
                    icon={Trash2}
                    compact
                    variant="ghost"
                    label={'Remove ' + manifest.name}
                    onPress={() => setRemove(manifest.id)}
                  />
                )}
              </View>
            </View>
          );
        })}
      </View>
      {!!resolvers.length && (
        <View style={{ marginTop: 30, gap: 14 }}>
          <Text style={s.introTitle}>Stream resolvers</Text>
          <Text style={s.description}>
            Providers are tried in this order when you open a stream URL.
          </Text>
          {resolvers.map((m, i) => (
            <View
              key={m.id}
              style={[
                s.cardHeader,
                {
                  padding: 15,
                  backgroundColor: colors.surface,
                  borderRadius: 8,
                },
              ]}
            >
              <Text style={s.version}>{i + 1}</Text>
              <Text style={[s.name, { flex: 1 }]}>{m.name}</Text>
              <Button
                icon={ArrowUp}
                compact
                variant="ghost"
                label={'Move ' + m.name + ' up'}
                disabled={i === 0}
                onPress={() => move(m.id, -1)}
              />
              <Button
                icon={ArrowDown}
                compact
                variant="ghost"
                label={'Move ' + m.name + ' down'}
                disabled={i === resolvers.length - 1}
                onPress={() => move(m.id, 1)}
              />
            </View>
          ))}
        </View>
      )}
      <Dialog
        visible={urlDialog || !!pending}
        onClose={() => {
          if (!busy) {
            setUrlDialog(false);
            setPending(null);
            setUrlError('');
          }
        }}
        title={pending ? 'Review provider' : 'Install provider from URL'}
      >
        {!pending && (
          <>
            <Text style={s.description}>
              Enter the URL of a .cfprovider bundle. You can review the provider
              and its requested access before installing.
            </Text>
            <Input
              value={bundleUrl}
              onChange={setBundleUrl}
              placeholder="https://your-server/provider.cfprovider"
              onSubmit={() => !busy && void loadUrl()}
            />
            {!!urlError && (
              <Text style={{ fontSize: textSize(14), color: colors.danger }}>
                {urlError}
              </Text>
            )}
            <Button
              variant="primary"
              disabled={busy || !bundleUrl.trim()}
              onPress={() => void loadUrl()}
            >
              {busy ? 'Loading…' : 'Review provider'}
            </Button>
          </>
        )}
        {pending && (
          <>
            <Text style={s.name}>
              {pending.manifest.name}{' '}
              <Text style={s.version}>v{pending.manifest.version}</Text>
            </Text>
            <Text style={s.description}>{pending.manifest.description}</Text>
            <Text style={ui.muted}>By {pending.manifest.author}</Text>
            <Text style={s.introTitle}>Requested access</Text>
            {pending.manifest.permissions.network.map((origin) => (
              <View key={origin} style={{ flexDirection: 'row', gap: 8 }}>
                <Globe size={15} color={colors.muted} />
                <Text style={ui.muted}>{origin}</Text>
              </View>
            ))}
            <Text style={s.description}>
              {pending.manifest.permissions.storage
                ? 'Separate provider storage is enabled.'
                : 'No provider storage access.'}
            </Text>
            {pending.manifest.permissions.agent !== undefined && (
              <Text style={s.description}>
                Requests the media agent
                {pending.manifest.permissions.agent.length
                  ? ' with ' + pending.manifest.permissions.agent.join(' and ')
                  : ' for reasoning'}
                . Enable access in Settings after installation. Agent requests
                can use your paid AI credits; plugins never receive your API
                keys.
              </Text>
            )}
            <Text style={s.description}>
              Install providers from authors you trust. Provider code runs in an
              interpreter with declared network access.
            </Text>
            {app.state.plugins.some(
              (p) => p.bundle.manifest.id === pending.manifest.id,
            ) && (
              <Text style={{ color: colors.warning, fontSize: textSize(13) }}>
                This replaces the installed version. Its settings will be kept.
              </Text>
            )}
            <Button
              variant="primary"
              icon={Check}
              disabled={busy}
              onPress={() => void install()}
            >
              {busy ? 'Installing…' : t.install}
            </Button>
            {!!urlError && (
              <Text style={{ fontSize: textSize(14), color: colors.danger }}>
                {urlError}
              </Text>
            )}
          </>
        )}
      </Dialog>
      <Dialog
        visible={!!editing}
        onClose={closeSettings}
        title={editing?.name ?? t.settings}
      >
        {editing && (
          <>
            <Text style={s.description}>{editing.description}</Text>
            {(editing.settings ?? []).map((setting) => (
              <View key={setting.id} style={{ gap: 9 }}>
                <Text style={s.settingLabel}>{setting.label}</Text>
                {setting.description && (
                  <Text style={s.description}>{setting.description}</Text>
                )}
                {setting.type === 'boolean' ? (
                  <Toggle
                    accessibilityLabel={setting.label}
                    value={Boolean(values[setting.id])}
                    onValueChange={(v) =>
                      setValues((s) => ({ ...s, [setting.id]: v }))
                    }
                  />
                ) : setting.type === 'select' ? (
                  <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
                    {setting.options?.map((option) => (
                      <Chip
                        key={option.value}
                        selected={values[setting.id] === option.value}
                        onPress={() =>
                          setValues((s) => ({
                            ...s,
                            [setting.id]: option.value,
                          }))
                        }
                      >
                        {option.label}
                      </Chip>
                    ))}
                  </ScrollView>
                ) : (
                  <Input
                    placeholder={setting.label}
                    secret={setting.type === 'password'}
                    value={String(values[setting.id] ?? '')}
                    onChange={(v) =>
                      setValues((s) => ({
                        ...s,
                        [setting.id]: setting.type === 'number' ? Number(v) : v,
                      }))
                    }
                  />
                )}
              </View>
            ))}
            {!editing.settings?.length && (
              <Text style={s.description}>
                This provider is ready to use. There are no additional settings.
              </Text>
            )}
            {editing.id === 'io.github.iteufel.cinefern.json-library' && (
              <Text style={s.description}>
                Saving the catalog URL grants this built-in provider access to
                that server’s origin. Web servers must allow CORS; desktop and
                native apps use their own network transport.
              </Text>
            )}
            {isJellyfin && (
              <Text style={s.description}>
                Sign in with your Jellyfin account. Include the server’s base
                path if it has one. Use HTTPS when connecting over the internet.
              </Text>
            )}
            {!!settingsError && (
              <Text
                accessibilityRole="alert"
                style={{ color: colors.danger, fontSize: textSize(14) }}
              >
                {settingsError}
              </Text>
            )}
            {!!editing.settings?.length && (
              <Button
                variant="primary"
                disabled={busy}
                onPress={() => void saveSettings()}
              >
                {busy
                  ? isJellyfin
                    ? 'Connecting…'
                    : 'Saving…'
                  : isJellyfin
                    ? jellyfinConnected
                      ? 'Sign in again'
                      : 'Connect to Jellyfin'
                    : 'Save settings'}
              </Button>
            )}
            {isJellyfin && jellyfinConnected && (
              <Button disabled={busy} onPress={() => void disconnect()}>
                Disconnect from Jellyfin
              </Button>
            )}
            {editing.homepage && !isTV && (
              <Button
                icon={ExternalLink}
                onPress={() => void platform.openExternal(editing.homepage!)}
              >
                Provider website
              </Button>
            )}
          </>
        )}
      </Dialog>
      <ConfirmDialog
        visible={!!remove}
        title="Remove this provider?"
        description="Saved titles and watch history stay in your library. Reinstall the provider to browse them again."
        confirm="Remove provider"
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove)
            void app
              .uninstall(remove)
              .catch((error) => app.notify(String(error)));
          setRemove(null);
        }}
      />
    </>
  );
}
const s = StyleSheet.create({
  intro: {
    flexDirection: 'row',
    gap: 20,
    padding: 25,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 26,
    alignItems: 'center',
  },
  introIcon: {
    padding: 16,
    backgroundColor: colors.accentDark,
    borderRadius: radius.card,
  },
  introTitle: {
    fontSize: textSize(17),
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.3,
  },
  description: {
    color: colors.muted,
    fontSize: textSize(13),
    lineHeight: textSize(22),
  },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 26,
    gap: 17,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  providerIcon: {
    height: 49,
    width: 49,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: colors.text, fontSize: textSize(16), fontWeight: '600' },
  version: { color: colors.subtle, fontSize: textSize(11) },
  capability: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.raised,
  },
  capabilityText: { color: colors.muted, fontSize: textSize(10) },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  permission: { color: colors.subtle, fontSize: textSize(10) },
  settingLabel: {
    color: colors.text,
    fontSize: textSize(13),
    fontWeight: '500',
  },
});
