import test from 'node:test';
import assert from 'node:assert/strict';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import {
  BaseChatModel,
  type BindToolsInput,
} from '@langchain/core/language_models/chat_models';
import type { ChatResult } from '@langchain/core/outputs';
import {
  assertManifest,
  type AgentResult,
  type ProviderAgent,
  type ProviderManifest,
} from '@cinefern/provider-sdk';
import {
  executeAgent,
  agentModel,
  type AgentExecution,
} from '../src/agent/engine';
import { MediaAgentService } from '../src/agent/service';
import {
  AI_ENDPOINTS,
  DEFAULT_AGENT_SETTINGS,
  agentGrant,
  agentKeyStatus,
  readAgentSettings,
  saveAgentKey,
  saveAgentSettings,
} from '../src/agent/settings';
import { parseBrowserPage, publicWebUrl } from '../src/agent/browser';
import { searchWeb } from '../src/agent/search';
import {
  portableAgentPlatform,
  type AgentPlatform,
} from '../src/agent/transport';
import { ProviderRuntime } from '../src/core/runtime';
import { LibraryStore, type KeyValueStorage } from '../src/core/library';
import { createHash } from '../src/agent/compat/crypto';

const manifest: ProviderManifest = {
  id: 'org.example.agent',
  version: '1.0.0',
  name: 'Agent test',
  author: 'Tests',
  apiVersion: 1,
  description: 'Agent fixture',
  capabilities: [],
  permissions: { network: [], agent: ['web-search', 'browser'] },
};
function memory() {
  const values = new Map<string, string>();
  const storage: KeyValueStorage = {
    get: async (k) => values.get(k) ?? null,
    set: async (k, v) => {
      values.set(k, v);
    },
    remove: async (k) => {
      values.delete(k);
    },
    keys: async () => [...values.keys()],
  };
  return { storage, values };
}
const result: AgentResult = {
  text: 'Verified film.',
  data: {},
  citations: [{ title: 'Sintel', url: 'https://example.com/film' }],
  usage: { modelCalls: 1, toolCalls: 0, searchCalls: 0 },
};
const response = (data: unknown) => ({
  ok: true,
  status: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(data),
});
const platform: AgentPlatform = {
  request: async () =>
    response({
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Sintel is a 2010 film.',
              annotations: [
                {
                  type: 'url_citation',
                  title: 'Sintel',
                  url: 'https://example.com/film',
                },
              ],
            },
          ],
        },
      ],
    }),
  browse: async (url) =>
    parseBrowserPage(
      '<title>Sintel</title><p>Released 2010.</p><a href="/credits">Credits</a><video src="https://example.com/film.mp4"></video>',
      url,
    ),
};
function execution(overrides: Partial<AgentExecution> = {}): AgentExecution {
  return {
    task: 'Find Sintel.',
    backend: 'openai',
    model: 'gpt-4.1-mini',
    key: 'fixture-not-a-real-key',
    tools: ['web-search', 'browser'],
    settings: DEFAULT_AGENT_SETTINGS,
    platform,
    signal: new AbortController().signal,
    authorize: async () => {},
    ...overrides,
  };
}
class ScriptedModel extends BaseChatModel {
  seen: BaseMessage[][] = [];
  exposed: string[][] = [];
  constructor(private responses: AIMessage[]) {
    super({});
  }
  _llmType() {
    return 'openai';
  }
  bindTools(tools: BindToolsInput[]) {
    this.exposed.push(
      tools.map((t) => ('name' in t ? String(t.name) : 'unknown')),
    );
    return this;
  }
  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    this.seen.push(messages);
    const message = this.responses.shift();
    if (!message) throw new Error('Unexpected model invocation.');
    return {
      generations: [
        {
          text: typeof message.content === 'string' ? message.content : '',
          message,
        },
      ],
    };
  }
}
const call = (name: string, args: Record<string, unknown>) =>
  new AIMessage({
    content: '',
    tool_calls: [{ name, args, id: 'call-' + name }],
  });
const answer = () =>
  new AIMessage(
    JSON.stringify({
      text: 'Sintel, released 2010. https://example.com/film',
      data: { year: 2010 },
    }),
  );

test('Deep Agents executes real search, browser navigation, and returns observed citations', async () => {
  const model = new ScriptedModel([
    call('web_search', { query: 'Sintel film year' }),
    call('browser_open', { url: 'https://example.com/film' }),
    call('browser_follow', {
      pageUrl: 'https://example.com/film',
      linkIndex: 0,
    }),
    answer(),
  ]);
  const resolved = await executeAgent(execution(), model);
  assert.equal(resolved.data.year, 2010);
  assert.deepEqual(resolved.usage, {
    modelCalls: 4,
    toolCalls: 3,
    searchCalls: 1,
  });
  assert.deepEqual(
    resolved.citations.map((c) => c.url),
    ['https://example.com/film', 'https://example.com/credits'],
  );
  assert.ok(
    model.exposed.every((tools) =>
      tools.every((name) =>
        ['web_search', 'browser_open', 'browser_follow'].includes(name),
      ),
    ),
  );
  assert.ok(!JSON.stringify(model.seen).includes('fixture-not-a-real-key'));
  assert.match(JSON.stringify(model.seen.at(-1)), /Released 2010/);
});
test('Deep Agents rejects undeclared tools, malformed output, and runaway model loops', async () => {
  await assert.rejects(
    executeAgent(
      execution(),
      new ScriptedModel([call('execute', { command: 'echo forbidden' })]),
    ),
    /not allowed/,
  );
  await assert.rejects(
    executeAgent(
      execution({ tools: [] }),
      new ScriptedModel([call('browser_open', { url: 'https://example.com' })]),
    ),
    /not allowed|invalid tool|not a valid tool/i,
  );
  await assert.rejects(
    executeAgent(execution(), new ScriptedModel([new AIMessage('not JSON')])),
    /invalid result/,
  );
  await assert.rejects(
    executeAgent(
      execution({ settings: { ...DEFAULT_AGENT_SETTINGS, maxModelCalls: 2 } }),
      new ScriptedModel([
        call('browser_open', { url: 'https://example.com/1' }),
        call('browser_open', { url: 'https://example.com/2' }),
        answer(),
      ]),
    ),
    /model-call limit/,
  );
  await assert.rejects(
    executeAgent(
      execution({ settings: { ...DEFAULT_AGENT_SETTINGS, maxToolCalls: 1 } }),
      new ScriptedModel([
        call('browser_open', { url: 'https://example.com/1' }),
        call('browser_open', { url: 'https://example.com/2' }),
        answer(),
      ]),
    ),
    /tool-call limit/,
  );
});
test('revoked permissions stop an active Deep Agents run before another model call', async () => {
  let revoked = false;
  let calls = 0;
  await assert.rejects(
    executeAgent(
      execution({
        authorize: async () => {
          if (revoked) throw new Error('Agent access changed.');
        },
        platform: {
          ...platform,
          browse: async (url, signal) => {
            calls++;
            revoked = true;
            return platform.browse(url, signal);
          },
        },
      }),
      new ScriptedModel([
        call('browser_open', { url: 'https://example.com/' }),
        answer(),
      ]),
    ),
    /access changed/,
  );
  assert.equal(calls, 1);
});
test('all model adapters use the selected fixed endpoint and keep credentials out of prompts', async () => {
  for (const backend of ['openai', 'xai', 'openrouter'] as const) {
    let invoked = false;
    const input = execution({
      backend,
      platform: {
        ...platform,
        request: async (url, options) => {
          invoked = true;
          assert.equal(
            url,
            AI_ENDPOINTS[backend] +
              (backend === 'openrouter' ? '/chat/completions' : '/responses'),
          );
          assert.equal(
            options.headers?.authorization ?? options.headers?.Authorization,
            'Bearer fixture-not-a-real-key',
          );
          assert.ok(!options.body?.includes('fixture-not-a-real-key'));
          const text = JSON.stringify({ text: 'OK', data: {} });
          return backend === 'openrouter'
            ? response({
                id: 'chat-test',
                choices: [
                  {
                    index: 0,
                    finish_reason: 'stop',
                    message: { role: 'assistant', content: text },
                  },
                ],
                usage: {
                  prompt_tokens: 1,
                  completion_tokens: 1,
                  total_tokens: 2,
                },
              })
            : response({
                id: 'resp-test',
                object: 'response',
                status: 'completed',
                output: [
                  {
                    id: 'msg-test',
                    type: 'message',
                    role: 'assistant',
                    status: 'completed',
                    content: [{ type: 'output_text', text, annotations: [] }],
                  },
                ],
                usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
              });
        },
      },
    });
    const completion = await agentModel(input).invoke('Reply OK.');
    assert.ok(invoked);
    assert.match(JSON.stringify(completion.content), /OK/);
  }
});
test('web search supports both Responses and OpenRouter citation formats', async () => {
  for (const backend of ['openai', 'xai', 'openrouter'] as const) {
    const found = await searchWeb(
      backend,
      'fixture-model',
      'fixture-key',
      'Sintel',
      async (url, options) => {
        assert.ok(url.startsWith(AI_ENDPOINTS[backend]));
        const body = JSON.parse(options.body!);
        if (backend === 'openrouter') {
          assert.deepEqual(body.plugins, [
            { id: 'web', engine: 'exa', max_results: 5 },
          ]);
          return response({
            choices: [
              {
                message: {
                  content: 'Sintel',
                  annotations: [
                    {
                      type: 'url_citation',
                      url_citation: {
                        url: 'https://example.com/film',
                        title: 'Sintel',
                      },
                    },
                  ],
                },
              },
            ],
          });
        }
        assert.deepEqual(body.tools, [{ type: 'web_search' }]);
        assert.equal(body.store, false);
        return platform.request(url, options, new AbortController().signal);
      },
      new AbortController().signal,
    );
    assert.equal(found.citations[0]?.url, 'https://example.com/film');
  }
});
test('provider agent access requires a declaration, enabled setting, key, and matching version grant', async () => {
  const { storage, values } = memory();
  let runs = 0;
  const service = new MediaAgentService(storage, platform, async () => {
    runs++;
    return result;
  });
  const api = service.forProvider(manifest);
  assert.equal((await api.status()).available, false);
  await assert.rejects(api.resolve({ instructions: 'Find a film' }), /Enable/);
  await saveAgentSettings(storage, {
    ...DEFAULT_AGENT_SETTINGS,
    enabled: true,
    grants: [agentGrant(manifest)],
  });
  await assert.rejects(api.resolve({ instructions: 'Find a film' }), /API key/);
  await saveAgentKey(storage, 'openai', 'fixture-key');
  assert.equal((await api.status()).available, true);
  assert.deepEqual(await api.resolve({ instructions: 'Find a film' }), result);
  assert.equal(runs, 1);
  assert.equal(
    (await service.forProvider({ ...manifest, version: '2.0.0' }).status())
      .available,
    false,
  );
  assert.equal(
    (
      await service
        .forProvider({ ...manifest, permissions: { network: [] } })
        .status()
    ).available,
    false,
  );
  assert.ok(!JSON.stringify(api).includes('fixture-key'));
  assert.ok(!values.get('cinefern.agent.settings.v1')?.includes('fixture-key'));
  assert.deepEqual(await agentKeyStatus(storage), {
    openai: true,
    xai: false,
    openrouter: false,
  });
});
test('concurrent limits, cancellation, persisted hourly limits, and SDK error redaction', async () => {
  const { storage } = memory();
  await saveAgentKey(storage, 'openai', 'fixture-secret');
  await saveAgentSettings(storage, {
    ...DEFAULT_AGENT_SETTINGS,
    enabled: true,
    grants: [agentGrant(manifest)],
    maxRunsPerHour: 1,
  });
  let started!: () => void;
  const begun = new Promise<void>((resolve) => {
    started = resolve;
  });
  const service = new MediaAgentService(storage, platform, async () => {
    started();
    return new Promise(() => {});
  });
  const api = service.forProvider(manifest);
  const running = api.resolve({ instructions: 'Wait' });
  await begun;
  await assert.rejects(api.resolve({ instructions: 'Concurrent' }), /busy/);
  service.cancel(manifest.id);
  await assert.rejects(running, /cancelled/);
  const restarted = new MediaAgentService(
    storage,
    platform,
    async () => result,
  );
  await assert.rejects(
    restarted.forProvider(manifest).resolve({ instructions: 'Again' }),
    /hourly/,
  );
  await saveAgentSettings(storage, {
    ...DEFAULT_AGENT_SETTINGS,
    enabled: true,
    grants: [agentGrant(manifest)],
  });
  const failing = new MediaAgentService(storage, platform, async () => {
    throw new Error('server echoed fixture-secret');
  });
  await assert.rejects(
    failing.forProvider(manifest).resolve({ instructions: 'Again' }),
    (error: Error) => !error.message.includes('fixture-secret'),
  );
});
test('provider removal invalidates retained agent handles and resets remove stored keys', async () => {
  const { storage, values } = memory();
  await saveAgentKey(storage, 'openrouter', 'fixture-key');
  const service = new MediaAgentService(storage, platform, async () => result);
  const runtime = new ProviderRuntime(
    storage,
    async () => response({}),
    service,
  );
  let retained!: ProviderAgent;
  await runtime.register(manifest, {
    create(context) {
      retained = context.agent;
      return {
        async getItem(id) {
          return { id, providerId: manifest.id, type: 'movie', title: 'Test' };
        },
      };
    },
  });
  await runtime.remove(manifest.id);
  assert.equal((await retained.status()).available, false);
  await assert.rejects(
    retained.resolve({ instructions: 'Read a page' }),
    /disabled or replaced/,
  );
  const library = new LibraryStore(storage);
  await library.initialize();
  await library.reset();
  assert.equal(values.size, 0);
});
test('agent media results retain only observed source URLs', async () => {
  const { storage } = memory();
  await saveAgentKey(storage, 'openai', 'fixture-key');
  await saveAgentSettings(storage, {
    ...DEFAULT_AGENT_SETTINGS,
    enabled: true,
    grants: [agentGrant(manifest)],
  });
  const service = new MediaAgentService(storage, platform, async () => ({
    ...result,
    data: {
      items: [
        { title: 'Sintel', type: 'movie', url: 'https://example.com/film' },
        {
          title: 'Invented',
          type: 'movie',
          url: 'https://example.com/made-up',
        },
      ],
    },
  }));
  const found = await service.forProvider(manifest).search({ query: 'Sintel' });
  assert.equal(found.items.length, 1);
  assert.equal(found.items[0]?.title, 'Sintel');
  await assert.rejects(
    service.forProvider(manifest).search({ query: '', limit: 100 }),
  );
});
test('browser tools reject private/credential URLs and parse bounded page data without scripts', async () => {
  for (const url of [
    'file:///etc/passwd',
    'http://example.com',
    'https://127.0.0.1',
    'https://2130706433',
    'https://[::1]',
    'https://x.local',
    'https://user:password@example.com',
    'https://example.com:8080',
  ])
    assert.throws(() => publicWebUrl(url));
  const page = parseBrowserPage(
    '<title>Film &amp; TV</title><script>hidden</script><style>hidden</style><p>Hello &amp; welcome</p><a href="/film">Film</a><a href="javascript:alert(1)">Bad</a>',
    'https://example.com/',
  );
  assert.equal(page.title, 'Film & TV');
  assert.ok(!page.text.includes('hidden'));
  assert.deepEqual(page.links, [
    { title: 'Film', url: 'https://example.com/film' },
  ]);
  let fetched = false;
  const adapter = portableAgentPlatform((async (_, init) => {
    fetched = true;
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.redirect, 'error');
    return new Response('<p>Movie</p>', {
      headers: { 'content-type': 'text/html' },
    });
  }) as typeof fetch);
  assert.equal(
    (await adapter.browse('https://example.com/', new AbortController().signal))
      .text,
    'Movie',
  );
  assert.ok(fetched);
  await assert.rejects(
    adapter.request('https://example.com/', {}, new AbortController().signal),
    /endpoint/,
  );
});
test('agent permissions validate, corrupt settings fail closed, and portable hashes match SHA-256', async () => {
  assertManifest(manifest);
  assert.throws(
    () =>
      assertManifest({
        ...manifest,
        permissions: { network: [], agent: ['shell'] },
      }),
    /agent permission/,
  );
  const { storage } = memory();
  await storage.set('cinefern.agent.settings.v1', '{bad');
  assert.equal((await readAgentSettings(storage)).enabled, false);
  assert.equal(
    createHash('sha256').update('abc').digest('hex'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});
