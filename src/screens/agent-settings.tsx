import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Bot, KeyRound } from 'lucide-react-native';
import { useApp } from '../app-context';
import { platform } from '../platform';
import { Button, Chip, Input } from '../ui/components';
import { Toggle } from '../ui/focus';
import { colors, textSize } from '../ui/theme';
import {
  AGENT_BACKENDS,
  BACKEND_LABELS,
  DEFAULT_AGENT_SETTINGS,
  agentGrant,
  agentKeyStatus,
  readAgentSettings,
  saveAgentKey,
  saveAgentSettings,
  type AgentBackend,
  type AgentSettings,
} from '../agent/settings';

export function AgentSettingsPanel() {
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
  const toggle = (
    label: string,
    value: boolean,
    onValueChange: (v: boolean) => void,
    description?: string,
  ) => (
    <View style={s.row}>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={s.label}>{label}</Text>
        {description && <Text style={s.description}>{description}</Text>}
      </View>
      <Toggle
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        disabled={!loaded || busy}
        trackColor={{ false: colors.border, true: '#355848' }}
        thumbColor={value ? colors.accent : colors.muted}
      />
    </View>
  );
  const providers = app.manifests.filter(
    (m) => m.permissions.agent !== undefined,
  );
  return (
    <View style={s.panel}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Bot size={24} color={colors.accent} />
        <Text style={s.title}>Media agent</Text>
      </View>
      <Text style={s.description}>
        Let trusted providers research media and resolve information. Requests
        and web searches use your selected AI service and may incur charges.
      </Text>
      {toggle('Enable media agent', settings.enabled, (enabled) =>
        update({ enabled }),
      )}
      <Text style={s.label}>AI service</Text>
      <View style={s.choices}>
        {AGENT_BACKENDS.map((backend) => (
          <Chip
            key={backend}
            selected={settings.backend === backend}
            onPress={() => {
              if (!busy) {
                update({ backend });
                setDraftKey('');
                setError('');
              }
            }}
          >
            {BACKEND_LABELS[backend]}
            {keys[backend] ? ' · Key saved' : ''}
          </Chip>
        ))}
      </View>
      <Text style={s.label}>Model</Text>
      <Input
        value={settings.models[settings.backend]}
        onChange={(value) =>
          update({ models: { ...settings.models, [settings.backend]: value } })
        }
        placeholder="Model ID"
      />
      <Text style={s.description}>
        Use a model with tool calling. OpenAI and xAI web search also require a
        model that supports their web-search tool.
      </Text>
      <Text style={s.label}>{BACKEND_LABELS[settings.backend]} API key</Text>
      <Input
        value={draftKey}
        onChange={setDraftKey}
        secret
        icon={KeyRound}
        placeholder={
          keys[settings.backend]
            ? 'Enter a replacement API key'
            : 'Enter API key'
        }
      />
      <View style={s.choices}>
        <Button
          compact
          disabled={!loaded || busy || !draftKey.trim()}
          onPress={() => void saveKey()}
        >
          Save API key
        </Button>
        {keys[settings.backend] && (
          <Button
            compact
            variant="danger"
            disabled={busy}
            onPress={() => void saveKey(true)}
          >
            Remove API key
          </Button>
        )}
      </View>
      <Text style={s.description}>
        {platform.name === 'Web'
          ? 'In the web preview, keys are kept only for this browser tab. Installed apps use system credential storage.'
          : 'Keys are saved in system credential storage on this device. Provider plugins cannot read them.'}
      </Text>
      {toggle(
        'Web search',
        settings.webSearch,
        (webSearch) => update({ webSearch }),
        'Search through the selected AI service. Up to two searches per run; no additional search key needed.',
      )}
      {toggle(
        'Browser tools',
        settings.browser,
        (browser) => update({ browser }),
        'Read public HTTPS pages and follow links. Desktop supports JavaScript pages; mobile and Apple TV use a page reader. Logins and forms are unavailable.',
      )}
      <Text style={s.label}>Model calls per run</Text>
      <View style={s.choices}>
        {[4, 6, 10].map((value) => (
          <Chip
            key={value}
            selected={settings.maxModelCalls === value}
            onPress={() => update({ maxModelCalls: value })}
          >
            {value}
          </Chip>
        ))}
      </View>
      <Text style={s.label}>Tool calls per run</Text>
      <View style={s.choices}>
        {[4, 8, 12].map((value) => (
          <Chip
            key={value}
            selected={settings.maxToolCalls === value}
            onPress={() => update({ maxToolCalls: value })}
          >
            {value}
          </Chip>
        ))}
      </View>
      <Text style={s.label}>Runs per hour</Text>
      <View style={s.choices}>
        {[5, 20, 50].map((value) => (
          <Chip
            key={value}
            selected={settings.maxRunsPerHour === value}
            onPress={() => update({ maxRunsPerHour: value })}
          >
            {value}
          </Chip>
        ))}
      </View>
      <Text style={s.label}>Provider access</Text>
      <Text style={s.description}>
        Allow each provider separately. A new provider version or changed tool
        request requires a new grant. Only send metadata you are comfortable
        sharing with your AI service.
      </Text>
      {!providers.length && (
        <Text style={s.description}>
          No installed provider requests agent access yet.
        </Text>
      )}
      {providers.map((manifest) => (
        <View key={manifest.id}>
          {toggle(
            'Allow ' + manifest.name,
            settings.grants.includes(agentGrant(manifest)),
            (value) =>
              update({
                grants: [
                  ...settings.grants.filter(
                    (grant) => grant !== agentGrant(manifest),
                  ),
                  ...(value ? [agentGrant(manifest)] : []),
                ],
              }),
            manifest.permissions.agent!.length
              ? 'Tools: ' + manifest.permissions.agent!.join(', ')
              : 'Reasoning only',
          )}
        </View>
      ))}
      <View style={s.choices}>
        <Button
          variant="primary"
          disabled={!loaded || busy}
          onPress={() => void save()}
        >
          {busy ? 'Saving…' : 'Save agent settings'}
        </Button>
        <Button
          onPress={() => {
            app.agent.cancel();
            setMessage('Active agent requests cancelled.');
          }}
        >
          Stop active requests
        </Button>
      </View>
      {!!error && (
        <Text
          accessibilityRole="alert"
          style={[s.description, { color: colors.danger }]}
        >
          {error}
        </Text>
      )}
      {!!message && (
        <Text
          accessibilityLiveRegion="polite"
          style={[s.description, { color: colors.accent }]}
        >
          {message}
        </Text>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  panel: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 20,
    gap: 16,
  },
  title: { color: colors.text, fontSize: textSize(20), fontWeight: '600' },
  label: { color: colors.text, fontSize: textSize(15), fontWeight: '500' },
  description: {
    color: colors.muted,
    fontSize: textSize(14),
    lineHeight: textSize(21),
  },
  row: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'center',
    paddingVertical: 10,
  },
  choices: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
});
