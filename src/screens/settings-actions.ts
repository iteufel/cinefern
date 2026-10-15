import { useState } from 'react';
import {
  assertMediaItem,
  mediaKey,
  type MediaItem,
  type MediaSource,
} from '@cinefern/provider-sdk';
import { useApp } from '../app-context';
import type { HistoryEntry, WatchlistEntry } from '../core/library';
import { platform } from '../platform';
import { fetchTextDocument } from '../core/import-document';

export function useSettingsActions() {
  const app = useApp();
  const [reset, setReset] = useState(false);
  const [streamUrl, setStreamUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [importUrlDialog, setImportUrlDialog] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importError, setImportError] = useState('');
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
  async function resetApp() {
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
  }
  return {
    reset,
    setReset,
    streamUrl,
    setStreamUrl,
    busy,
    importUrlDialog,
    setImportUrlDialog,
    importUrl,
    setImportUrl,
    importError,
    exportLibrary,
    importLibrary,
    importFromUrl,
    openStream,
    resetApp,
  };
}
