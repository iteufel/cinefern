import {
  mediaKey,
  type MediaItem,
  type MediaSource,
} from '@cinefern/provider-sdk';
import { type DownloadEntry, LibraryStore } from './library';
import type { PlatformServices } from '../platform/types';

export class DownloadManager {
  private active = new Map<string, AbortController>();
  private completion = new Map<string, Promise<void>>();
  constructor(
    private library: LibraryStore,
    private platform: PlatformServices,
  ) {}
  async add(item: MediaItem, source: MediaSource) {
    if (source.type !== 'http' || source.live || !source.downloadable)
      throw new Error('Choose a provider source that supports file downloads.');
    const existing = this.library
      .getSnapshot()
      .downloads.find(
        (d) =>
          mediaKey(d.item) === mediaKey(item) &&
          ['queued', 'downloading', 'complete'].includes(d.status),
      );
    if (existing) return;
    const id =
      Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    const entry: DownloadEntry = {
      id,
      item,
      sourceUrl: source.url,
      headers: source.headers,
      status: 'queued',
      progress: 0,
      bytes: 0,
      createdAt: Date.now(),
    };
    this.library.update({
      downloads: [entry, ...this.library.getSnapshot().downloads],
    });
    await this.start(entry);
  }
  async retry(id: string) {
    const entry = this.library.getSnapshot().downloads.find((d) => d.id === id);
    if (entry) await this.start(entry);
  }
  private async start(entry: DownloadEntry) {
    if (this.active.has(entry.id)) return;
    const controller = new AbortController();
    this.active.set(entry.id, controller);
    let finish!: () => void;
    this.completion.set(
      entry.id,
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    this.library.updateDownload(entry.id, {
      status: 'downloading',
      progress: 0,
      error: undefined,
    });
    let lastUpdate = 0;
    let latestProgress = {
      bytes: 0,
      totalBytes: undefined as number | undefined,
    };
    try {
      const localUri = await this.platform.download(
        { id: entry.id, url: entry.sourceUrl, headers: entry.headers },
        (progress) => {
          latestProgress = {
            bytes: progress.bytes,
            totalBytes: progress.totalBytes,
          };
          if (Date.now() - lastUpdate < 500) return;
          lastUpdate = Date.now();
          this.library.updateDownload(entry.id, {
            ...progress,
            progress: progress.totalBytes
              ? progress.bytes / progress.totalBytes
              : 0,
          });
        },
        controller.signal,
      );
      if (controller.signal.aborted) {
        await this.platform.removeDownload(localUri);
        throw new Error('Download cancelled.');
      }
      this.library.updateDownload(entry.id, {
        ...latestProgress,
        status: 'complete',
        progress: 1,
        localUri,
      });
    } catch (error) {
      this.library.updateDownload(entry.id, {
        status: controller.signal.aborted ? 'cancelled' : 'failed',
        error: String(error),
      });
    } finally {
      this.active.delete(entry.id);
      this.completion.delete(entry.id);
      finish();
    }
  }
  cancel(id: string) {
    this.active.get(id)?.abort();
  }
  async remove(id: string) {
    const completion = this.completion.get(id);
    this.cancel(id);
    await completion;
    const entry = this.library.getSnapshot().downloads.find((d) => d.id === id);
    if (entry?.localUri) await this.platform.removeDownload(entry.localUri);
    this.library.update({
      downloads: this.library
        .getSnapshot()
        .downloads.filter((d) => d.id !== id),
    });
  }
}
