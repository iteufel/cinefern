import { useState } from 'react';
import {
  parseBundle,
  type ProviderBundle,
  type ProviderManifest,
  type SettingValue,
} from '@cinefern/provider-sdk';
import { useApp } from '../app-context';
import { platform } from '../platform';
import { fetchTextDocument } from '../core/import-document';
import { jellyfinManifest } from '../providers/jellyfin';
export function useProviderSettings() {
  const app = useApp();
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
  return {
    pending,
    setPending,
    editing,
    values,
    setValues,
    remove,
    setRemove,
    busy,
    urlDialog,
    setUrlDialog,
    bundleUrl,
    setBundleUrl,
    urlError,
    setUrlError,
    settingsError,
    isJellyfin,
    jellyfinConnected,
    closeSettings,
    loadUrl,
    chooseFile,
    edit,
    saveSettings,
    disconnect,
    install,
    resolvers,
    move,
  };
}
