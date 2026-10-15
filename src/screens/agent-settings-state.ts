import { useEffect, useState } from 'react';
import { useApp } from '../app-context';
import { platform } from '../platform';
import {
  DEFAULT_AGENT_SETTINGS,
  agentKeyStatus,
  readAgentSettings,
  saveAgentKey,
  saveAgentSettings,
  type AgentBackend,
  type AgentSettings,
} from '../agent/settings';
export function useAgentSettings() {
  const app = useApp();
  const [settings, setSettings] = useState<AgentSettings>(
    DEFAULT_AGENT_SETTINGS,
  );
  const [keys, setKeys] = useState<Record<AgentBackend, boolean>>({
    openai: false,
    xai: false,
    openrouter: false,
  });
  const [draftKey, setDraftKey] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    void Promise.all([
      readAgentSettings(platform.storage),
      agentKeyStatus(platform.storage),
    ])
      .then(([saved, status]) => {
        if (mounted) {
          setSettings(saved);
          setKeys(status);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (mounted)
          setError(
            'Could not open credential storage. Unlock your system keyring and retry.',
          );
      });
    return () => {
      mounted = false;
    };
  }, []);
  function update(change: Partial<AgentSettings>) {
    setSettings((s) => ({ ...s, ...change }));
    setMessage('');
  }
  async function saveKey(remove = false) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      app.agent.cancel();
      await saveAgentKey(
        platform.storage,
        settings.backend,
        remove ? '' : draftKey,
      );
      setDraftKey('');
      setKeys(await agentKeyStatus(platform.storage));
      setMessage(remove ? 'API key removed.' : 'API key saved.');
    } catch {
      setError(
        'Could not save the API key. Check the key and unlock your system credential storage.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      app.agent.cancel();
      await saveAgentSettings(platform.storage, settings);
      app.runtime.clearCache();
      setMessage('Agent settings saved.');
    } catch {
      setError(
        'Could not save agent settings. Check model names and storage availability.',
      );
    } finally {
      setBusy(false);
    }
  }
  return {
    settings,
    keys,
    draftKey,
    setDraftKey,
    loaded,
    busy,
    message,
    setMessage,
    error,
    setError,
    update,
    saveKey,
    save,
  };
}
