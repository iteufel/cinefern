# Media agent

Cinefern gives TypeScript providers a small, framework-independent agent API. Internally it uses
[Deep Agents JS](https://docs.langchain.com/oss/javascript/deepagents/overview), with an explicitly configured
LangChain model, bounded tools, and ephemeral in-memory state. Providers do not import Deep Agents,
choose an AI vendor, or receive API keys.

## Set up

1. Open **Settings → Media agent**.
2. Choose **OpenAI**, **xAI**, or **OpenRouter**, enter an API key, and press **Save API key**.
   Keys for all three services can be saved independently. Select the service and model to use.
3. Enable the media agent and the desired tools. Set the model-call, tool-call, and hourly run limits.
4. Under **Provider access**, allow the installed providers you trust, then press **Save agent settings**.

Keys use Electron's OS-encrypted credential files on desktop and Expo SecureStore on iOS, Android, and
Apple TV. Linux needs an unlocked system keyring; plaintext fallback is rejected. In the browser preview,
agent keys live in sessionStorage for the current tab only. Keys are excluded from library exports and
provider storage. Remove a key from this panel, or reset the app to remove all saved keys.

Requests send the provider's task, supplied metadata, and relevant tool results to the selected AI service.
Model calls and web searches can incur charges. The limits bound work, not a currency amount; configure
spending limits with your AI service as needed. The hourly counter persists across app restarts.

Ordinary provider searches remain automatic. Providers declaring agent access are included when the user
presses **Search with agents** or submits the search field. Typing alone does not start paid agent calls.
Changing the query or leaving the search page cancels its outstanding agent requests.
Other provider methods may use the agent after access has been granted.

Defaults are `gpt-4.1-mini`, `grok-4.7`, and `openai/gpt-4.1-mini`, respectively. Model IDs are editable.
Use a model supporting function tools and JSON output. OpenAI and xAI also need native web-search support
when that tool is enabled. Account/model availability is controlled by each service.

## Provider contract

Declare agent access in the manifest separately from ordinary provider network permissions:

```json
{
  "permissions": {
    "network": [],
    "storage": true,
    "agent": ["web-search", "browser"]
  }
}
```

An empty `agent` array requests reasoning without network tools. Omitting the field denies all agent use.
The effective tools are the intersection of this declaration and the user's enabled tools.
Installing or reinstalling a bundle revokes its previous grant. Grants also bind to the provider ID,
version, and requested tools. Disabling, replacing, or uninstalling a provider invalidates its old handles
and cancels active work.

```ts
const status = await context.agent.status();
if (!status.available) throw new Error(status.reason);

const found = await context.agent.search({ query: 'Sintel animated film', limit: 5 });
// found.items: { title, type, year?, overview?, url }[]
// Also: text, data, citations, usage

const resolved = await context.agent.resolve({
  url: found.items[0].url,
  instructions: 'Verify the release year and director. Return data.year and data.director.',
  context: 'Title: Sintel',
});
```

`resolve` returns `{ text, data, citations, usage }`. `data` is an untrusted JSON object; validate its fields
before using them as `MediaItem` or `MediaSource` values. Never treat an agent-generated URL as a verified
playable source without checking it. `search` accepts 1–10 results and retains only items whose URL was
observed by a host tool. Citations come from actual search responses and opened pages. They establish
provenance, not a guarantee that every extracted claim is correct. A provider should retain/display the
sources alongside its metadata. Do not send passwords, access tokens, or unrelated personal data as context.

The SDK deliberately exposes no model class, arbitrary tool registration, system-prompt replacement,
filesystem, shell, environment variables, or credential accessor. Provider code continues to execute
inside SandboxJS. This is a constrained capability interface, not a claim that SandboxJS or an LLM is an
audited hostile-code security boundary.

## Tools and platform behavior

| Tool             | Behavior                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `web_search`     | Grounded research through the selected service, with citations; at most two calls per run. |
| `browser_open`   | Reads a public HTTPS page and returns text, numbered links, and visible media URLs.        |
| `browser_follow` | Opens a numbered link from a page already read during the run.                             |

OpenAI and xAI search use their Responses API `web_search` tool. OpenRouter uses its web plugin with the
Exa engine and five results. No separate search API key is needed. See the official
[OpenAI search API](https://developers.openai.com/api/docs/guides/tools-web-search),
[xAI search API](https://docs.x.ai/developers/tools/web-search), and
[OpenRouter web plugin](https://openrouter.ai/docs/guides/features/plugins/web-search).
The two-search limit counts service requests; a service may perform multiple underlying searches within
one request. Provider-side usage reports count local model, tool, and search calls, not billed tokens.

Desktop opens pages in a fresh sandboxed Chromium session, waits briefly for JavaScript, and extracts
visible text. It blocks non-GET/HEAD requests, private-address DNS results, credentials, permissions,
popups, downloads, and access to the app preload. It has no access to a user's logged-in browser profile.
Sessions and connections are cleared after each page. This is a read-only browser: there are no forms,
arbitrary script execution tools, or coordinate clicks.

iOS, Android, and Apple TV use Expo's fetch transport and an HTML page reader with link navigation.
JavaScript-only pages and authenticated sites require an external provider implementation; the reader
does not execute page scripts. The browser preview additionally depends on the destination's CORS policy.
Portable browsing omits cookies, blocks credential URLs, IP literals and local hostnames, and refuses
redirects. Desktop additionally checks resolved addresses; portable readers do not implement DNS pinning.
Jellyfin and ordinary provider network permissions are separate and continue to support local servers.

## Limits and implementation

- At most two simultaneous runs in the app, one per provider.
- A two-minute run deadline, 45-second model/search request timeout, and 20-second desktop page deadline.
- Default six model calls and eight tool calls per run, configurable up to ten/twelve.
- Default twenty runs per rolling hour, persisted locally; configurable in Settings.
- Bounded input, HTTP response, page text, links, search results, and final JSON sizes.
- Cancellation when stopped in Settings, permissions/keys change, or a provider is removed/replaced.
- No shared conversations, persisted agent memory, automatic model retries, or delegation.

The engine is lazy-loaded. `deepagents/browser` runs on all targets. Metro adaptations in
`scripts/metro-agent.cjs` use browser-compatible hashing/glob dependencies, disable the unused cloud
sandbox adapter, and replace LangChain's dynamic package loader with an explicit rejection. Cinefern
always supplies an instantiated model. Native entry points install secure random IDs via Expo Crypto
before loading the app. The tool allowlist is enforced both at model binding and tool execution;
filesystem permissions deny reads and writes even though the backend is ephemeral memory.

The current dependency audit includes an unpatched `braces` nested-pattern denial-of-service advisory
([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)), inherited through Deep Agents'
glob dependencies. Cinefern does not expose glob tools or accept user-supplied filesystem patterns.
The repository also has existing Expo/build-tool advisories. Do not run a forced dependency downgrade
as a substitute for reviewing these chains.

## Example and verification

```sh
npm run plugin:agent-example
```

Install `dist-providers/org.cinefern.media-research.cfprovider`, allow **Media Research** in Settings,
then search using **Search with agents**. Its [source](../providers/agent-example/provider.ts) demonstrates
both search and metadata resolution. It provides searchable metadata, not a streaming catalog.
Apple TV can install the same bundle from a hosted URL.

```sh
npm run check
npm run build
npm run build:mobile
npm run build:tvos
npm run plugin:agent-example
npm run test:agent-desktop
```

The desktop smoke test uses an isolated profile, fake API credentials, deterministic model/search
responses, and a rendered HTTPS fixture. It exercises a compiled plugin through the real Deep Agents
loop, encrypted credential persistence, reload, explicit search, browser link following, blocked POSTs,
and key deletion. It makes no paid model calls. Native bundles are validated separately; native device
execution and live model-service accounts still need testing on configured devices/accounts.
