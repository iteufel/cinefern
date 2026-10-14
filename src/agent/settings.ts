import { z } from 'zod';
import type { ProviderManifest } from '@cinefern/provider-sdk';
import type { KeyValueStorage } from '../core/library';

export const AGENT_BACKENDS = ['openai', 'xai', 'openrouter'] as const;
export type AgentBackend = (typeof AGENT_BACKENDS)[number];
export const BACKEND_LABELS = {
  openai: 'OpenAI',
  xai: 'xAI',
  openrouter: 'OpenRouter',
};
export const AI_ENDPOINTS = {
  openai: 'https://api.openai.com/v1',
  xai: 'https://api.x.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};
const model = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[\w./:@-]+$/);
export const agentSettingsSchema = z.object({
  enabled: z.boolean(),
  backend: z.enum(AGENT_BACKENDS),
  models: z.object({ openai: model, xai: model, openrouter: model }),
  webSearch: z.boolean(),
  browser: z.boolean(),
  maxModelCalls: z.number().int().min(2).max(10),
  maxToolCalls: z.number().int().min(1).max(12),
  maxRunsPerHour: z.number().int().min(1).max(100),
  grants: z.array(z.string().max(300)).max(500),
});
export type AgentSettings = z.infer<typeof agentSettingsSchema>;
export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  enabled: false,
  backend: 'openai',
  models: {
    openai: 'gpt-4.1-mini',
    xai: 'grok-4.7',
    openrouter: 'openai/gpt-4.1-mini',
  },
  webSearch: true,
  browser: true,
  maxModelCalls: 6,
  maxToolCalls: 8,
  maxRunsPerHour: 20,
  grants: [],
};
const SETTINGS_KEY = 'cinefern.agent.settings.v1';
const secretKey = (backend: AgentBackend) => 'cinefern.secret.agent.' + backend;
export function agentGrant(manifest: ProviderManifest) {
  return (
    manifest.id +
    '@' +
    manifest.version +
    ':' +
    [...(manifest.permissions.agent ?? [])].sort().join(',')
  );
}
export async function readAgentSettings(
  storage: KeyValueStorage,
): Promise<AgentSettings> {
  const text = await storage.get(SETTINGS_KEY);
  if (!text) return structuredDefaults();
  try {
    return agentSettingsSchema.parse(JSON.parse(text));
  } catch {
    return structuredDefaults();
  }
}
function structuredDefaults(): AgentSettings {
  return {
    ...DEFAULT_AGENT_SETTINGS,
    models: { ...DEFAULT_AGENT_SETTINGS.models },
    grants: [],
  };
}
export async function saveAgentSettings(
  storage: KeyValueStorage,
  settings: AgentSettings,
) {
  await storage.set(
    SETTINGS_KEY,
    JSON.stringify(agentSettingsSchema.parse(settings)),
  );
}
export async function revokeAgentGrant(
  storage: KeyValueStorage,
  providerId: string,
) {
  const settings = await readAgentSettings(storage);
  const grants = settings.grants.filter(
    (grant) => !grant.startsWith(providerId + '@'),
  );
  if (grants.length !== settings.grants.length)
    await saveAgentSettings(storage, { ...settings, grants });
}
export async function saveAgentKey(
  storage: KeyValueStorage,
  backend: AgentBackend,
  value: string,
) {
  if (!AGENT_BACKENDS.includes(backend)) throw new Error('Unknown AI service.');
  const key = value.trim();
  if (key.length > 2000 || /\s/.test(key))
    throw new Error('Enter a valid API key without spaces.');
  if (key) await storage.set(secretKey(backend), key);
  else await storage.remove(secretKey(backend));
}
export function readAgentKey(storage: KeyValueStorage, backend: AgentBackend) {
  return storage.get(secretKey(backend));
}
export async function agentKeyStatus(storage: KeyValueStorage) {
  const entries = await Promise.all(
    AGENT_BACKENDS.map(
      async (backend) =>
        [backend, !!(await readAgentKey(storage, backend))] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<AgentBackend, boolean>;
}
