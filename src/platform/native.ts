import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { Linking, Platform } from 'react-native';
import type { PlatformServices } from './types';
import { readTextFile, exportText } from './files';

const directory = () => {
  const base = Platform.isTV
    ? FileSystem.cacheDirectory
    : FileSystem.documentDirectory;
  if (!base) throw new Error('Document storage is unavailable.');
  return base + 'media/';
};
export const platform: PlatformServices = {
  name: Platform.isTV ? 'Apple TV' : Platform.OS === 'ios' ? 'iOS' : 'Android',
  storage: {
    get: (key) =>
      key.startsWith('cinefern.secret.')
        ? SecureStore.getItemAsync(key)
        : AsyncStorage.getItem(key),
    async set(key, value) {
      if (key.startsWith('cinefern.secret.')) {
        await SecureStore.setItemAsync(key, value);
        // Enumerate a marker, never the secret, so resetting the app also clears Keychain entries.
        await AsyncStorage.setItem(key, 'secure');
      } else await AsyncStorage.setItem(key, value);
    },
    async remove(key) {
      if (key.startsWith('cinefern.secret.'))
        await SecureStore.deleteItemAsync(key);
      await AsyncStorage.removeItem(key);
    },
    async keys() {
      return [...(await AsyncStorage.getAllKeys())];
    },
  },
  async request(url, options) {
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
  readTextFile,
  exportText,
  async download(request, onProgress, signal) {
    await FileSystem.makeDirectoryAsync(directory(), { intermediates: true });
    const uri = directory() + encodeURIComponent(request.id) + '.mp4';
    const task = FileSystem.createDownloadResumable(
      request.url,
      uri,
      { headers: request.headers },
      (p) =>
        onProgress({
          bytes: p.totalBytesWritten,
          totalBytes:
            p.totalBytesExpectedToWrite > 0
              ? p.totalBytesExpectedToWrite
              : undefined,
        }),
    );
    const cancel = () => {
      void task.cancelAsync();
    };
    if (signal.aborted) throw new Error('Download cancelled.');
    signal.addEventListener('abort', cancel);
    try {
      const result = await task.downloadAsync();
      if (signal.aborted) throw new Error('Download cancelled.');
      if (!result || result.status < 200 || result.status >= 300)
        throw new Error('Download failed (HTTP ' + result?.status + ').');
      return result.uri;
    } catch (error) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      throw error;
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  },
  async localMediaUri(uri) {
    if (!(await FileSystem.getInfoAsync(uri)).exists)
      throw new Error('The downloaded file is missing. Retry the download.');
    return uri;
  },
  async removeDownload(uri) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  },
  async openExternal(url) {
    await Linking.openURL(url);
  },
};
