import { Button, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { disabled, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { useApp } from '../app-context';
import { AGENT_BACKENDS, BACKEND_LABELS, agentGrant } from '../agent/settings';
import { AppleForm, ApplePicker, AppleTextField } from '../ui/apple-controls';
import { useAgentSettings } from './agent-settings-state';

export function AppleAgentSettings({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const state = useAgentSettings();
  const { settings, update, busy, loaded } = state;
  return (
    <AppleForm title="Media Agent">
      <Section>
        <Button label="Done" systemImage="checkmark" onPress={onClose} />
      </Section>
      <Section
        title="Media Agent"
        footer={
          <Text>
            Trusted providers can research media using your AI service. Requests
            and web searches may incur charges.
          </Text>
        }
      >
        <Toggle
          label="Enable Media Agent"
          isOn={settings.enabled}
          onIsOnChange={(enabled) => update({ enabled })}
          modifiers={[disabled(!loaded || busy)]}
        />
        <ApplePicker
          label="AI Service"
          value={settings.backend}
          options={AGENT_BACKENDS.map((b) => [b, BACKEND_LABELS[b]] as const)}
          onChange={(backend) => {
            update({ backend });
            state.setDraftKey('');
          }}
        />
        <AppleTextField
          label="Model"
          value={settings.models[settings.backend]}
          onChange={(model) =>
            update({
              models: { ...settings.models, [settings.backend]: model },
            })
          }
        />
      </Section>
      <Section
        title="API Key"
        footer={
          <Text>
            Saved in system credential storage. Providers cannot read your key.
          </Text>
        }
      >
        <AppleTextField
          label={
            state.keys[settings.backend] ? 'Replacement API key' : 'API key'
          }
          value={state.draftKey}
          onChange={state.setDraftKey}
          secret
        />
        <Button
          label="Save API Key"
          onPress={() => void state.saveKey()}
          modifiers={[disabled(!loaded || busy || !state.draftKey.trim())]}
        />
        {state.keys[settings.backend] && (
          <Button
            label="Remove API Key"
            role="destructive"
            onPress={() => void state.saveKey(true)}
            modifiers={[disabled(busy)]}
          />
        )}
      </Section>
      <Section title="Tools and Limits">
        <Toggle
          label="Web Search"
          isOn={settings.webSearch}
          onIsOnChange={(webSearch) => update({ webSearch })}
        />
        <Toggle
          label="Read Web Pages"
          isOn={settings.browser}
          onIsOnChange={(browser) => update({ browser })}
        />
        <ApplePicker
          label="Model Calls per Run"
          value={settings.maxModelCalls}
          options={[4, 6, 10].map((v) => [v, String(v)] as const)}
          onChange={(maxModelCalls) => update({ maxModelCalls })}
        />
        <ApplePicker
          label="Tool Calls per Run"
          value={settings.maxToolCalls}
          options={[4, 8, 12].map((v) => [v, String(v)] as const)}
          onChange={(maxToolCalls) => update({ maxToolCalls })}
        />
        <ApplePicker
          label="Runs per Hour"
          value={settings.maxRunsPerHour}
          options={[5, 20, 50].map((v) => [v, String(v)] as const)}
          onChange={(maxRunsPerHour) => update({ maxRunsPerHour })}
        />
      </Section>
      <Section
        title="Provider Access"
        footer={
          <Text>
            Allow each provider separately. Changed provider versions or tool
            requests require a new grant.
          </Text>
        }
      >
        {app.manifests
          .filter((m) => m.permissions.agent !== undefined)
          .map((manifest) => (
            <Toggle
              key={manifest.id}
              label={manifest.name}
              isOn={settings.grants.includes(agentGrant(manifest))}
              onIsOnChange={(allow) =>
                update({
                  grants: [
                    ...settings.grants.filter(
                      (g) => g !== agentGrant(manifest),
                    ),
                    ...(allow ? [agentGrant(manifest)] : []),
                  ],
                })
              }
            />
          ))}
        <Button
          label={busy ? 'Saving…' : 'Save Agent Settings'}
          onPress={() => void state.save()}
          modifiers={[disabled(!loaded || busy)]}
        />
        <Button
          label="Stop Active Requests"
          onPress={() => {
            app.agent.cancel();
            state.setMessage('Requests stopped.');
          }}
        />
        {!!state.error && (
          <Text modifiers={[foregroundStyle('#ff453a')]}>{state.error}</Text>
        )}
        {!!state.message && <Text>{state.message}</Text>}
      </Section>
    </AppleForm>
  );
}
