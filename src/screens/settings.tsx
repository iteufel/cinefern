import { Toggle } from '../ui/focus';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ArrowUpRight,
  Download,
  ExternalLink,
  FileUp,
  Globe,
  Link,
  RefreshCw,
  Trash2,
} from 'lucide-react-native';
import {
  assertMediaItem,
  mediaKey,
  type MediaItem,
  type MediaSource,
} from '@cinefern/provider-sdk';
import { useApp } from '../app-context';
import {
  DEFAULT_SETTINGS,
  type HistoryEntry,
  type WatchlistEntry,
} from '../core/library';
import { platform } from '../platform';
import {
  Button,
  Chip,
  Input,
  PageHeader,
  styles as ui,
} from '../ui/components';
import { ConfirmDialog, Dialog } from '../ui/dialog';
import { colors, isTV, textSize } from '../ui/theme';
import { useT } from '../ui/i18n';
import { fetchTextDocument } from '../core/import-document';
import { AgentSettingsPanel } from './agent-settings';

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1, minWidth: 160, gap: 5 }}>
        <Text style={s.label}>{label}</Text>
        {description && <Text style={s.description}>{description}</Text>}
      </View>
      {children}
    </View>
  );
}
function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.group}>
      <Text style={s.groupTitle}>{title}</Text>
      {children}
    </View>
  );
}
export function SettingsScreen() {
  const app = useApp();
  const t = useT();
  const settings = app.state.settings;
  const [reset, setReset] = useState(false);
  const [streamUrl, setStreamUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [importUrlDialog, setImportUrlDialog] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importError, setImportError] = useState('');
  const toggle = (
    key: keyof typeof settings,
    label: string,
    description?: string,
  ) => (
    <Row label={label} description={description}>
      <Toggle
        accessibilityLabel={label}
        value={Boolean(settings[key])}
        onValueChange={(v) => app.library.setSettings({ [key]: v })}
        trackColor={{ false: colors.border, true: '#355848' }}
        thumbColor={settings[key] ? colors.accent : colors.muted}
      />
    </Row>
  );
  async function exportLibrary() {
    try {
      const { settings, watchlist, history } = app.state;
      await platform.exportText(
        'cinefern-library.json',
        JSON.stringify(
          {
            format: 'cinefern-library',
            version: 1,
            settings,
            watchlist,
            history,
          },
          null,
          2,
        ),
      );
      app.notify('Library exported');
    } catch (error) {
      app.notify(String(error));
    }
  }
  async function importLibrary(text?: string) {
    try {
      if (text === undefined) {
        const file = await platform.readTextFile();
        if (!file) return;
        text = file.text;
      }
      const data = JSON.parse(text) as {
        format: string;
        version: number;
        watchlist: WatchlistEntry[];
        history: HistoryEntry[];
      };
      if (
        data.format !== 'cinefern-library' ||
        data.version !== 1 ||
        !Array.isArray(data.watchlist) ||
        !Array.isArray(data.history)
      )
        throw new Error('Choose a Cinefern 5 library export.');
      for (const entry of [...data.watchlist, ...data.history])
        assertMediaItem(entry.item, entry.item.providerId);
      const watchlist = [...app.state.watchlist, ...data.watchlist].filter(
        (e, i, all) =>
          all.findIndex((x) => mediaKey(x.item) === mediaKey(e.item)) === i,
      );
      const history = [...app.state.history, ...data.history]
        .filter(
          (e) =>
            Number.isFinite(e.position) &&
            Number.isFinite(e.duration) &&
            e.duration > 0,
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .filter(
          (e, i, all) =>
            all.findIndex((x) => mediaKey(x.item) === mediaKey(e.item)) === i,
        );
      app.library.update({ watchlist, history });
      app.notify('Watchlist and history imported');
      setImportUrlDialog(false);
    } catch (error) {
      setImportError(String(error).replace(/^Error: /, ''));
      app.notify(String(error).replace(/^Error: /, ''));
    }
  }
  async function importFromUrl() {
    setBusy(true);
    setImportError('');
    try {
      await importLibrary(
        await fetchTextDocument(importUrl, (url) => platform.request(url)),
      );
    } catch (error) {
      setImportError(String(error).replace(/^Error: /, ''));
    } finally {
      setBusy(false);
    }
  }
  async function openStream() {
    setBusy(true);
    try {
      const url = new URL(streamUrl);
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error('Enter an HTTP or HTTPS media URL.');
      const records = app.runtime
        .all()
        .filter((r) => r.provider.resolve)
        .sort((a, b) => {
          const index = (id: string) => {
            const i = app.state.resolverOrder.indexOf(id);
            return i < 0 ? 999 : i;
          };
          return index(a.manifest.id) - index(b.manifest.id);
        });
      let source: MediaSource | null = null;
      for (const record of records) {
        try {
          source = await app.runtime.call<MediaSource | null>(
            record.manifest.id,
            'resolve',
            [url.href],
          );
          if (source) break;
        } catch {}
      }
      source ??= {
        id: 'direct',
        url: url.href,
        type: /\.m3u8(?:[?#]|$)/i.test(url.href)
          ? 'hls'
          : /\.mpd(?:[?#]|$)/i.test(url.href)
            ? 'dash'
            : 'http',
        label: 'Direct stream',
      };
      if (
        (platform.name === 'iOS' || platform.name === 'Apple TV') &&
        source.type === 'dash'
      )
        throw new Error(
          'Choose an HLS playlist or a supported video file on ' +
            platform.name +
            '.',
        );
      const item: MediaItem = {
        id: source.url,
        providerId: 'direct',
        type: 'movie',
        title: decodeURIComponent(
          url.pathname.split('/').pop() || url.hostname,
        ),
      };
      // Keep resolver metadata, headers, and subtitles in the playback descriptor.
      app.setPlayback({
        item,
        sources: [source],
        source,
        queue: [item],
        index: 0,
        startAt: app.state.settings.resume
          ? (app.library.progress(item)?.position ?? 0)
          : 0,
      });
    } catch (error) {
      app.notify(String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title={t.settings}
        eyebrow="MAKE YOURSELF AT HOME"
        description="A few small preferences. A cinema that feels like yours."
      />
      <Group title="Appearance & language">
        <Row label="Interface language">
          <View style={s.choices}>
            <Chip
              selected={settings.language === 'en'}
              onPress={() => app.library.setSettings({ language: 'en' })}
            >
              English
            </Chip>
            <Chip
              selected={settings.language === 'de'}
              onPress={() => app.library.setSettings({ language: 'de' })}
            >
              Deutsch
            </Chip>
          </View>
        </Row>
        {!isTV && (
          <Row label="Open title details">
            <View style={s.choices}>
              <Chip
                selected={settings.detailPresentation === 'page'}
                onPress={() =>
                  app.library.setSettings({ detailPresentation: 'page' })
                }
              >
                Page
              </Chip>
              <Chip
                selected={settings.detailPresentation === 'modal'}
                onPress={() =>
                  app.library.setSettings({ detailPresentation: 'modal' })
                }
              >
                Dialog
              </Chip>
            </View>
          </Row>
        )}
        {toggle(
          'vibrancy',
          'Soft background effects',
          'Use subtle gradients in the interface.',
        )}
        {toggle(
          'showAdult',
          'Show adult content',
          'Include titles and providers marked as adult.',
        )}
      </Group>
      <Group title="Playback">
        {toggle(
          'autoplay',
          'Play the next episode',
          'Continue through your queue when a title ends.',
        )}
        {toggle(
          'resume',
          'Resume where I left off',
          'Remember playback progress for movies and episodes.',
        )}
        {toggle(
          'autoplayTrailers',
          'Autoplay previews',
          'Open a movie preview when you view its details.',
        )}
        {toggle(
          'cropTrailers',
          'Fill the frame for previews',
          'Crop previews to fill the player.',
        )}
        {!isTV &&
          toggle(
            'scrollVolume',
            'Scroll to change volume',
            'Use the mouse wheel over the desktop player.',
          )}
        <Row label="Preferred video quality">
          <ScrollView horizontal contentContainerStyle={s.choices}>
            {[480, 720, 1080, 2160].map((quality) => (
              <Chip
                key={quality}
                selected={settings.quality === quality}
                onPress={() => app.library.setSettings({ quality })}
              >
                {quality === 2160 ? '4K' : quality + 'p'}
              </Chip>
            ))}
          </ScrollView>
        </Row>
        <Row label="Audio language">
          <View style={s.choices}>
            {['en', 'de', 'fr', 'es'].map((language) => (
              <Chip
                key={language}
                selected={settings.audioLanguage === language}
                onPress={() =>
                  app.library.setSettings({ audioLanguage: language })
                }
              >
                {language.toUpperCase()}
              </Chip>
            ))}
          </View>
        </Row>
        <Row label="Subtitle language">
          <ScrollView horizontal contentContainerStyle={s.choices}>
            {['', 'en', 'de', 'fr', 'es'].map((language) => (
              <Chip
                key={language}
                selected={settings.subtitleLanguage === language}
                onPress={() =>
                  app.library.setSettings({ subtitleLanguage: language })
                }
              >
                {language ? language.toUpperCase() : 'Off'}
              </Chip>
            ))}
          </ScrollView>
        </Row>
      </Group>
      <AgentSettingsPanel />
      <Group title="Open a stream">
        <Text style={s.description}>
          Play an HTTP file or HLS playlist{!isTV && ', or a DASH manifest'}.
          Installed resolvers can also extract a playable source.
        </Text>
        <View style={{ gap: 12, paddingTop: 14 }}>
          <Input
            value={streamUrl}
            onChange={setStreamUrl}
            placeholder="https://your-server/video.m3u8"
            icon={Link}
            onSubmit={() => void openStream()}
          />
          <Button
            variant="primary"
            disabled={!streamUrl || busy}
            onPress={() => void openStream()}
            style={{ alignSelf: 'flex-start' }}
          >
            Open stream
          </Button>
        </View>
      </Group>
      <Group title="Your data">
        <Row
          label={t.history}
          description="Review watched titles and saved playback progress."
        >
          <Button compact onPress={() => app.navigate({ name: 'history' })}>
            View history
          </Button>
        </Row>
        <Row
          label="Library backup"
          description={
            isTV
              ? 'Import a hosted Cinefern 5 backup by URL. File export is available on mobile and desktop.'
              : 'Export your watchlist and history, or merge another Cinefern 5 export.'
          }
        >
          <View style={s.choices}>
            {!isTV && (
              <Button
                icon={Download}
                compact
                onPress={() => void exportLibrary()}
              >
                Export
              </Button>
            )}
            <Button
              icon={FileUp}
              compact
              onPress={() =>
                isTV ? setImportUrlDialog(true) : void importLibrary()
              }
            >
              Import
            </Button>
          </View>
        </Row>
        <Row
          label="Provider cache"
          description="Refresh cached browsing and search results."
        >
          <Button
            icon={RefreshCw}
            compact
            onPress={() => {
              app.runtime.clearCache();
              void app
                .configureProviders()
                .catch((error) => app.notify(String(error)));
              app.notify('Provider cache cleared');
            }}
          >
            Clear cache
          </Button>
        </Row>
        <Row
          label="Reset Cinefern"
          description="Remove settings, installed plugins, saved titles, history, and downloads."
        >
          <Button
            icon={Trash2}
            compact
            variant="danger"
            onPress={() => setReset(true)}
          >
            Reset app
          </Button>
        </Row>
        {app.state.persistenceError && (
          <Text style={{ color: colors.warning, fontSize: textSize(13) }}>
            {app.state.persistenceError}
          </Text>
        )}
      </Group>
      <Group title="Made in the open">
        <Text style={[s.label, { marginBottom: 9 }]}>
          Cinefern 5.0 · {platform.name}
        </Text>
        <Text style={s.description}>
          An open-source media player for Windows, macOS, Linux, iOS, Android,
          and Apple TV. Built with React Native. Licensed under
          AGPL-3.0-or-later.
        </Text>
        <Text style={[s.description, { marginTop: 12 }]}>
          Film artwork © Blender Foundation: Sintel / durian.blender.org, Big
          Buck Bunny / bigbuckbunny.org, Tears of Steel / mango.blender.org (CC
          BY 3.0); Elephants Dream / Orange Open Movie Project (CC BY 2.5).
          Images are scaled and cropped for display.
        </Text>
        {!isTV && (
          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              flexWrap: 'wrap',
              marginTop: 10,
            }}
          >
            <Button
              compact
              variant="ghost"
              onPress={() =>
                void platform.openExternal(
                  'https://creativecommons.org/licenses/by/3.0/',
                )
              }
            >
              CC BY 3.0
            </Button>
            <Button
              compact
              variant="ghost"
              onPress={() =>
                void platform.openExternal(
                  'https://creativecommons.org/licenses/by/2.5/',
                )
              }
            >
              CC BY 2.5
            </Button>
          </View>
        )}
        {!isTV && (
          <Button
            variant="ghost"
            compact
            icon={ExternalLink}
            style={{ alignSelf: 'flex-start', marginTop: 15 }}
            onPress={() =>
              void platform.openExternal('https://github.com/iteufel/cinefern')
            }
          >
            Project on GitHub
          </Button>
        )}
        {isTV && (
          <Text style={[s.description, { marginTop: 15 }]}>
            github.com/iteufel/cinefern · creativecommons.org/licenses/by/3.0 ·
            creativecommons.org/licenses/by/2.5
          </Text>
        )}
      </Group>
      <Dialog
        visible={importUrlDialog}
        onClose={() => !busy && setImportUrlDialog(false)}
        title="Import library from URL"
      >
        <Text style={s.description}>
          Host your exported Cinefern library on your server and enter its URL
          to merge saved titles and history.
        </Text>
        <Input
          value={importUrl}
          onChange={setImportUrl}
          placeholder="https://your-server/cinefern-library.json"
          onSubmit={() => !busy && void importFromUrl()}
        />
        {!!importError && (
          <Text style={{ fontSize: textSize(14), color: colors.danger }}>
            {importError}
          </Text>
        )}
        <Button
          variant="primary"
          disabled={busy || !importUrl.trim()}
          onPress={() => void importFromUrl()}
        >
          {busy ? 'Importing…' : 'Import library'}
        </Button>
      </Dialog>
      <ConfirmDialog
        visible={reset}
        title="Reset Cinefern?"
        description="This deletes your saved library, plugins, preferences, and downloaded files from this device."
        confirm="Reset app"
        onCancel={() => setReset(false)}
        onConfirm={() => {
          void (async () => {
            try {
              for (const download of [...app.state.downloads])
                await app.downloads.remove(download.id);
              app.setPlayback(null);
              app.agent.cancel();
              await app.library.reset();
              await app.configureProviders();
              app.navigate({ name: 'home' });
            } catch (error) {
              app.notify(String(error));
            } finally {
              setReset(false);
            }
          })();
        }}
      />
    </>
  );
}
const s = StyleSheet.create({
  group: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 20,
  },
  groupTitle: {
    color: colors.text,
    fontSize: textSize(17),
    fontWeight: '600',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 15,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  label: { color: colors.text, fontSize: textSize(13), fontWeight: '500' },
  description: {
    color: colors.muted,
    fontSize: textSize(12),
    lineHeight: textSize(20),
    maxWidth: 750,
  },
  choices: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
});
