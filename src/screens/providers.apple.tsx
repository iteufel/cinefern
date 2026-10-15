import { Alert } from 'react-native';
import { Button, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { disabled, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { useApp } from '../app-context';
import { platform } from '../platform';
import {
  AppleForm,
  ApplePicker,
  AppleSheet,
  AppleTextField,
} from '../ui/apple-controls';
import { isTV } from '../ui/theme';
import { useT } from '../ui/i18n';
import { jellyfinManifest } from '../providers/jellyfin';
import { useProviderSettings } from './providers-state';

export function ProvidersScreen() {
  const app = useApp();
  const t = useT();
  const state = useProviderSettings();
  const { editing, values, busy, pending } = state;
  return (
    <>
      <AppleForm title={t.providers}>
        {app.manifests.map((manifest) => {
          const plugin = app.state.plugins.find(
            (p) => p.bundle.manifest.id === manifest.id,
          );
          const enabled = app.library.isProviderEnabled(manifest.id);
          const error = app.runtime
            .all()
            .find((p) => p.manifest.id === manifest.id)?.error;
          return (
            <Section
              key={manifest.id}
              title={manifest.name}
              footer={<Text>{error || manifest.description}</Text>}
            >
              <Toggle
                label={manifest.name}
                isOn={enabled}
                onIsOnChange={(value) =>
                  void app
                    .setEnabled(manifest.id, value)
                    .catch((e) => app.notify(String(e)))
                }
              />
              <Button
                label={
                  manifest.id === jellyfinManifest.id &&
                  !state.jellyfinConnected
                    ? 'Connect to Jellyfin'
                    : manifest.name + ' Settings'
                }
                systemImage={
                  manifest.id === jellyfinManifest.id
                    ? 'server.rack'
                    : 'slider.horizontal.3'
                }
                onPress={() => void state.edit(manifest)}
              />
              {plugin && (
                <Button
                  label={'Remove ' + manifest.name}
                  role="destructive"
                  onPress={() =>
                    Alert.alert(
                      'Remove Provider?',
                      'Your saved titles and history will stay in the library.',
                      [
                        { text: t.cancel, style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: () =>
                            void app
                              .uninstall(manifest.id)
                              .catch((e) => app.notify(String(e))),
                        },
                      ],
                    )
                  }
                />
              )}
            </Section>
          );
        })}
        <Section
          title="Add Provider"
          footer={
            <Text>
              Connect another media source with a Cinefern provider bundle.
            </Text>
          }
        >
          {!isTV && (
            <Button
              label="Choose Provider File"
              systemImage="doc.badge.plus"
              onPress={() => void state.chooseFile()}
            />
          )}
          <Button
            label="Install from URL"
            systemImage="link"
            onPress={() => state.setUrlDialog(true)}
          />
        </Section>
        {!!state.resolvers.length && (
          <Section
            title="Resolver Order"
            footer={
              <Text>
                Resolvers are tried in this order when opening a stream.
              </Text>
            }
          >
            {state.resolvers.map((m, i) => (
              <ApplePicker
                key={m.id}
                label={m.name}
                value={i}
                options={state.resolvers.map(
                  (_, position) => [position, String(position + 1)] as const,
                )}
                onChange={(position) => state.move(m.id, position - i)}
              />
            ))}
          </Section>
        )}
      </AppleForm>
      <AppleSheet
        visible={!!editing}
        title={editing?.name ?? t.settings}
        onClose={state.closeSettings}
        busy={busy}
      >
        <Section footer={<Text>{editing?.description}</Text>}>
          {editing?.settings?.map((setting) =>
            setting.type === 'boolean' ? (
              <Toggle
                key={setting.id}
                label={setting.label}
                isOn={Boolean(values[setting.id])}
                onIsOnChange={(value) =>
                  state.setValues((s) => ({ ...s, [setting.id]: value }))
                }
              />
            ) : setting.type === 'select' ? (
              <ApplePicker
                key={setting.id}
                label={setting.label}
                value={String(values[setting.id] ?? '')}
                options={(setting.options ?? []).map(
                  (o) => [o.value, o.label] as const,
                )}
                onChange={(value) =>
                  state.setValues((s) => ({ ...s, [setting.id]: value }))
                }
              />
            ) : (
              <AppleTextField
                key={editing.id + ':' + setting.id}
                label={setting.label}
                value={String(values[setting.id] ?? '')}
                secret={setting.type === 'password'}
                url={setting.id.toLowerCase().includes('url')}
                numeric={setting.type === 'number'}
                onChange={(value) =>
                  state.setValues((s) => ({
                    ...s,
                    [setting.id]:
                      setting.type === 'number' ? Number(value) : value,
                  }))
                }
              />
            ),
          )}
          {!editing?.settings?.length && (
            <Text>This provider is ready to use.</Text>
          )}
        </Section>
        <Section>
          {!!state.settingsError && (
            <Text modifiers={[foregroundStyle('#ff453a')]}>
              {state.settingsError}
            </Text>
          )}
          {!!editing?.settings?.length && (
            <Button
              label={
                busy
                  ? 'Saving…'
                  : state.isJellyfin
                    ? 'Connect to Jellyfin'
                    : 'Save Settings'
              }
              onPress={() => void state.saveSettings()}
              modifiers={[disabled(busy)]}
            />
          )}
          {state.isJellyfin && state.jellyfinConnected && (
            <Button
              label="Disconnect"
              role="destructive"
              onPress={() => void state.disconnect()}
              modifiers={[disabled(busy)]}
            />
          )}
          {editing?.homepage && !isTV && (
            <Button
              label="Provider Website"
              systemImage="arrow.up.right"
              onPress={() => void platform.openExternal(editing.homepage!)}
            />
          )}
        </Section>
      </AppleSheet>
      <AppleSheet
        visible={state.urlDialog || !!pending}
        title={pending ? 'Review Provider' : 'Add Provider'}
        busy={busy}
        onClose={() => {
          if (!busy) {
            state.setPending(null);
            state.setUrlDialog(false);
            state.setUrlError('');
          }
        }}
      >
        {pending ? (
          <>
            <Section
              title={pending.manifest.name}
              footer={<Text>{pending.manifest.description}</Text>}
            >
              <Text>
                Version {pending.manifest.version} · {pending.manifest.author}
              </Text>
            </Section>
            <Section
              title="Requested Access"
              footer={
                <Text>
                  Install providers from authors you trust. Provider code is
                  limited to its declared access.
                </Text>
              }
            >
              {pending.manifest.permissions.network.map((origin) => (
                <Text key={origin}>{origin}</Text>
              ))}
              <Text>
                {pending.manifest.permissions.storage
                  ? 'Provider storage'
                  : 'No storage access'}
              </Text>
              {pending.manifest.permissions.agent !== undefined && (
                <Text>
                  Media agent access. Enable this separately in Settings;
                  requests may use paid AI credits.
                </Text>
              )}
              <Button
                label={busy ? 'Installing…' : t.install}
                onPress={() => void state.install()}
                modifiers={[disabled(busy)]}
              />
            </Section>
          </>
        ) : (
          <Section title="Provider URL">
            <AppleTextField
              label="https://your-server/provider.cfprovider"
              value={state.bundleUrl}
              onChange={state.setBundleUrl}
              url
            />
            <Button
              label={busy ? 'Loading…' : 'Review Provider'}
              onPress={() => void state.loadUrl()}
              modifiers={[disabled(busy || !state.bundleUrl.trim())]}
            />
          </Section>
        )}
        {!!state.urlError && (
          <Section>
            <Text modifiers={[foregroundStyle('#ff453a')]}>
              {state.urlError}
            </Text>
          </Section>
        )}
      </AppleSheet>
    </>
  );
}
