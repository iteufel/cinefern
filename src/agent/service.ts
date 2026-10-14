import { z } from 'zod';
import type {
  AgentResult,
  ProviderAgent,
  ProviderManifest,
} from '@cinefern/provider-sdk';
import type { KeyValueStorage } from '../core/library';
import type { AgentPlatform } from './transport';
import type { AgentExecution } from './engine';
import { agentGrant, readAgentKey, readAgentSettings } from './settings';
import { publicWebUrl } from './browser';

const resolveSchema = z.object({
  instructions: z.string().trim().min(1).max(3000),
  url: z.string().max(2048).optional(),
  context: z.string().max(8000).optional(),
});
const searchSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(10).default(5),
});
const matchesSchema = z
  .array(
    z.object({
      title: z.string().min(1).max(300),
      type: z.enum(['movie', 'series', 'episode']),
      year: z.number().int().min(1800).max(2200).optional(),
      overview: z.string().max(2000).optional(),
      url: z.string().max(2048).transform(publicWebUrl),
    }),
  )
  .max(10);
type Runner = (input: AgentExecution) => Promise<AgentResult>;

export class MediaAgentService {
  private active = new Map<string, AbortController>();
  private reservations: Promise<void> = Promise.resolve();
  constructor(
    private storage: KeyValueStorage,
    private platform: AgentPlatform,
    private runner?: Runner,
  ) {}
  cancel(providerId?: string) {
    for (const [id, controller] of this.active)
      if (!providerId || id === providerId) controller.abort();
  }
  async status(manifest: ProviderManifest) {
    const settings = await readAgentSettings(this.storage);
    const requested = manifest.permissions.agent;
    const tools = (requested ?? []).filter((tool) =>
      tool === 'browser' ? settings.browser : settings.webSearch,
    );
    const reason =
      requested === undefined
        ? 'This provider has not declared agent access.'
        : !settings.enabled
          ? 'Enable the media agent in Settings.'
          : !settings.grants.includes(agentGrant(manifest))
            ? 'Allow agent access for this provider in Settings.'
            : !(await readAgentKey(this.storage, settings.backend))
              ? 'Add an API key for the selected AI service in Settings.'
              : undefined;
    return { available: !reason, reason, tools };
  }
  forProvider(
    manifest: ProviderManifest,
    isActive = () => true,
  ): ProviderAgent {
    // Snapshot the declaration so a plugin cannot mutate its permissions while a run is active.
    const declared: ProviderManifest = JSON.parse(JSON.stringify(manifest));
    const api: ProviderAgent = {
      status: async () =>
        isActive()
          ? this.status(declared)
          : {
              available: false,
              reason: 'This provider was disabled or replaced.',
              tools: [],
            },
      search: async (request) => {
        const { query, limit } = searchSchema.parse(request);
        const result = await this.run(
          declared,
          `Find up to ${limit} movies, series, or episodes matching this query: ${JSON.stringify(query)}. Use web search to verify results. In data.items return an array of {title,type,year?,overview?,url}. Each url must be an exact source URL returned by a tool. Use an empty array if none can be verified.`,
          isActive,
        );
        let items;
        try {
          items = matchesSchema.parse(result.data.items ?? []);
        } catch {
          throw new Error(
            'The agent returned invalid media matches. Try a more specific query.',
          );
        }
        const observed = new Set(result.citations.map((c) => c.url));
        return {
          ...result,
          items: items.filter((item) => observed.has(item.url)).slice(0, limit),
        };
      },
      resolve: async (request) => {
        const value = resolveSchema.parse(request);
        if (value.url) publicWebUrl(value.url);
        return this.run(
          declared,
          JSON.stringify({
            task: value.instructions,
            url: value.url,
            context: value.context,
          }),
          isActive,
        );
      },
    };
    return Object.freeze(api);
  }
  private reserveRun(limit: number) {
    const reservation = this.reservations
      .catch(() => {})
      .then(async () => {
        const key = 'cinefern.agent.usage.v1';
        const raw: unknown = JSON.parse((await this.storage.get(key)) ?? '[]');
        const recent = (Array.isArray(raw) ? raw : []).filter(
          (time): time is number =>
            typeof time === 'number' && time > Date.now() - 3_600_000,
        );
        if (recent.length >= limit)
          throw new Error(
            'The hourly agent-run limit has been reached. Adjust it in Settings or try later.',
          );
        await this.storage.set(key, JSON.stringify([...recent, Date.now()]));
      });
    this.reservations = reservation;
    return reservation;
  }
  private async run(
    manifest: ProviderManifest,
    task: string,
    isActive: () => boolean,
  ): Promise<AgentResult> {
    // Reserve synchronously before any await so simultaneous plugin calls cannot bypass limits.
    if (this.active.has(manifest.id) || this.active.size >= 2)
      throw new Error(
        'The media agent is busy. Try again after the current request finishes.',
      );
    const controller = new AbortController();
    this.active.set(manifest.id, controller);
    const timer = setTimeout(() => controller.abort(), 120_000);
    let rejectAbort: (() => void) | undefined;
    try {
      if (!isActive())
        throw new Error(
          'Agent access changed. This provider was disabled or replaced.',
        );
      const settings = await readAgentSettings(this.storage);
      const status = await this.status(manifest);
      if (!status.available) throw new Error(status.reason);
      const key = await readAgentKey(this.storage, settings.backend);
      if (!key) throw new Error('Add an API key in Settings.');
      await this.reserveRun(settings.maxRunsPerHour);
      const execute = this.runner ?? (await import('./engine')).executeAgent;
      const authorize = async () => {
        if (controller.signal.aborted)
          throw new Error('Agent run cancelled or timed out.');
        const current = await this.status(manifest);
        if (
          !isActive() ||
          !current.available ||
          status.tools.some((tool) => !current.tools.includes(tool))
        )
          throw new Error(
            'Agent access changed. Start a new request after updating Settings.',
          );
      };
      await authorize();
      return await Promise.race([
        execute({
          task,
          backend: settings.backend,
          model: settings.models[settings.backend],
          key,
          tools: status.tools,
          settings,
          platform: this.platform,
          signal: controller.signal,
          authorize,
        }),
        new Promise<never>((_, reject) => {
          rejectAbort = () =>
            reject(new Error('Agent run cancelled or timed out.'));
          controller.signal.addEventListener('abort', rejectAbort, {
            once: true,
          });
          if (controller.signal.aborted) rejectAbort();
        }),
      ]);
    } catch (error) {
      // SDK errors may contain HTTP payloads; never return them to an untrusted provider.
      if (
        error instanceof Error &&
        (error.name === 'AgentFailure' ||
          /^(Enable |Allow |Add an API key|The hourly|Agent (run|access))/.test(
            error.message,
          ))
      )
        throw new Error(error.message);
      throw new Error(
        'The media agent could not finish. Check the selected model, API key, tool access, and service credits.',
      );
    } finally {
      clearTimeout(timer);
      if (rejectAbort)
        controller.signal.removeEventListener('abort', rejectAbort);
      controller.abort();
      this.active.delete(manifest.id);
    }
  }
}
