import type { HttpOptions, HttpResponse } from '@cinefern/provider-sdk';
import type {
  PlatformServices,
  DownloadProgress,
  DownloadRequest,
} from './types';

interface DesktopBridge {
  platform: string;
  request(url: string, options?: HttpOptions): Promise<HttpResponse>;
  download(request: DownloadRequest): Promise<string>;
  cancelDownload(id: string): Promise<void>;
  onDownloadProgress(
    callback: (event: DownloadProgress & { id: string }) => void,
  ): () => void;
  removeDownload(uri: string): Promise<void>;
  setAlwaysOnTop(enabled: boolean): Promise<void>;
  openExternal(url: string): Promise<void>;
  fileSource(url: string, headers: Record<string, string>): Promise<string>;
  releaseFileSource(uri: string): Promise<void>;
}
declare global {
  interface Window {
    cinefern?: DesktopBridge;
  }
}
const bridge = typeof window === 'undefined' ? undefined : window.cinefern;
let database: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('cinefern-media', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('files', mode);
    const request = action(tx.objectStore('files'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new Error('Storage transaction aborted.'));
  });
}
export const platform: PlatformServices = {
  name: bridge?.platform ?? 'Web',
  storage: {
    async get(key) {
      return localStorage.getItem(key);
    },
    async set(key, value) {
      localStorage.setItem(key, value);
    },
    async remove(key) {
      localStorage.removeItem(key);
    },
    async keys() {
      return Object.keys(localStorage);
    },
  },
  async request(url, options) {
    if (bridge) return bridge.request(url, options);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      const body = await response.text();
      if (body.length > 5_000_000)
        throw new Error('Provider response is too large.');
      return {
        ok: response.ok,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body,
      };
    } finally {
      clearTimeout(timer);
    }
  },
  async readTextFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.cfprovider,.json';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) return resolve(null);
        if (file.size > 2_000_000)
          return reject(new Error('The file is larger than 2 MB.'));
        try {
          resolve({ name: file.name, text: await file.text() });
        } catch (error) {
          reject(error);
        }
      };
      input.addEventListener('cancel', () => {
        input.remove();
        resolve(null);
      });
      input.click();
    });
  },
  async exportText(name, text) {
    const uri = URL.createObjectURL(
      new Blob([text], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = uri;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(uri), 1000);
  },
  async download(request, progress, signal) {
    if (bridge) {
      const unsubscribe = bridge.onDownloadProgress((event) => {
        if (event.id === request.id) progress(event);
      });
      const cancel = () => {
        void bridge.cancelDownload(request.id);
      };
      if (signal.aborted) throw new Error('Download cancelled.');
      signal.addEventListener('abort', cancel);
      try {
        return await bridge.download(request);
      } finally {
        unsubscribe();
        signal.removeEventListener('abort', cancel);
      }
    }
    const response = await fetch(request.url, {
      headers: request.headers,
      signal,
    });
    if (!response.ok)
      throw new Error('Download failed (HTTP ' + response.status + ').');
    const totalBytes =
      Number(response.headers.get('content-length')) || undefined;
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let bytes = 0;
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Streaming downloads are unavailable.');
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new Uint8Array(value));
      bytes += value.byteLength;
      progress({ bytes, totalBytes });
    }
    const blob = new Blob(chunks, {
      type: response.headers.get('content-type') || 'video/mp4',
    });
    await transaction('readwrite', (store) => store.put(blob, request.id));
    return 'indexeddb:' + request.id;
  },
  async localMediaUri(uri) {
    if (!uri.startsWith('indexeddb:')) return uri;
    const blob = await transaction<Blob | undefined>('readonly', (store) =>
      store.get(uri.slice(10)),
    );
    if (!blob)
      throw new Error('The downloaded file is missing. Retry the download.');
    return URL.createObjectURL(blob);
  },
  async removeDownload(uri) {
    if (bridge) return bridge.removeDownload(uri);
    await transaction('readwrite', (store) => store.delete(uri.slice(10)));
  },
  setAlwaysOnTop: bridge
    ? (enabled) => bridge.setAlwaysOnTop(enabled)
    : undefined,
  prepareFilePlayback: bridge
    ? async (url, headers) => {
        const uri = await bridge.fileSource(url, headers);
        return { uri, dispose: () => bridge.releaseFileSource(uri) };
      }
    : undefined,
  async openExternal(url) {
    if (bridge) return bridge.openExternal(url);
    window.open(url, '_blank', 'noopener,noreferrer');
  },
};
