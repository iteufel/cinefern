// Runs the production Electron renderer against deterministic AI and browser fixtures.
// No paid model requests, user credentials, or existing app profile are used.
const { app, BrowserWindow, net } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const dns = require('node:dns/promises');
const root = path.resolve(__dirname, '..');
const userData = syncFs.mkdtempSync(
  path.join(os.tmpdir(), 'cinefern-agent-smoke-'),
);
const key = 'fixture-agent-key-not-a-real-secret';
const counts = { models: 0, searches: 0, pages: 0, forbiddenPosts: 0 };
app.setPath('userData', userData);
app.disableHardwareAcceleration();
const originalLookup = dns.lookup;
dns.lookup = (host, options) =>
  host === 'example.org'
    ? Promise.resolve([{ address: '93.184.215.14', family: 4 }])
    : originalLookup(host, options);
app.on('session-created', (isolated) => {
  if (isolated.getStoragePath()) return;
  isolated.protocol.handle('https', (request) => {
    assert.equal(new URL(request.url).hostname, 'example.org');
    if (request.method !== 'GET') counts.forbiddenPosts++;
    counts.pages++;
    return new Response(
      '<!doctype html><title>Research fixture</title><body><h1>Sintel Research Fixture</h1><p id="synopsis"></p><a href="/credits">Credits</a><script>document.querySelector("#synopsis").textContent="Rendered film metadata from 2010";fetch("https://example.org/submit",{method:"POST",body:"blocked"}).catch(()=>{});</script></body>',
      { headers: { 'content-type': 'text/html' } },
    );
  });
});
function completion(output) {
  return {
    id: 'resp-' + (counts.models + counts.searches),
    object: 'response',
    status: 'completed',
    output,
    usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
  };
}
function message(text, annotations = []) {
  return {
    id: 'msg-fixture',
    type: 'message',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text, annotations }],
  };
}
const originalFetch = net.fetch.bind(net);
net.fetch = async (url, options) => {
  if (url !== 'https://api.openai.com/v1/responses')
    return originalFetch(url, options);
  const headers = new Headers(options.headers);
  assert.equal(headers.get('authorization'), 'Bearer ' + key);
  assert.ok(!options.body.includes(key));
  const body = JSON.parse(options.body);
  let output;
  if (body.tools.some((tool) => tool.type === 'web_search')) {
    counts.searches++;
    output = [
      message('Sintel is a 2010 movie.', [
        {
          type: 'url_citation',
          title: 'Sintel',
          url: 'https://example.org/film',
          start_index: 0,
          end_index: 6,
        },
      ]),
    ];
  } else {
    counts.models++;
    assert.ok(
      body.tools.every((tool) =>
        ['web_search', 'browser_open', 'browser_follow'].includes(tool.name),
      ),
    );
    const step = (counts.models - 1) % 4;
    if (step < 3) {
      const [name, args] = [
        ['web_search', { query: 'Sintel research fixture' }],
        ['browser_open', { url: 'https://example.org/film' }],
        [
          'browser_follow',
          { pageUrl: 'https://example.org/film', linkIndex: 0 },
        ],
      ][step];
      output = [
        {
          id: 'fc-' + step,
          type: 'function_call',
          name,
          arguments: JSON.stringify(args),
          call_id: 'call-' + step,
          status: 'completed',
        },
      ];
    } else {
      assert.match(options.body, /Rendered film metadata from 2010/);
      output = [
        message(
          JSON.stringify({
            text: 'Sintel verified at https://example.org/film',
            data: {
              items: [
                {
                  title: 'Sintel Research Fixture',
                  type: 'movie',
                  year: 2010,
                  overview: 'Verified by search and rendered browser tools.',
                  url: 'https://example.org/film',
                },
              ],
            },
          }),
        ),
      ];
    }
  }
  return new Response(JSON.stringify(completion(output)), {
    headers: { 'content-type': 'application/json' },
  });
};
require(path.join(root, 'apps/desktop/main.cjs'));
const server = http.createServer(async (_, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(
    await fs.readFile(
      path.join(root, 'dist-providers/org.cinefern.media-research.cfprovider'),
    ),
  );
});
async function waitFor(fn, label, timeout = 20000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const result = await fn();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out: ' + label);
}
app.whenReady().then(async () => {
  let window;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    window = await waitFor(() => BrowserWindow.getAllWindows()[0], 'window');
    const run = (code) => window.webContents.executeJavaScript(code);
    const text = () => run('document.body.innerText');
    const click = (label) =>
      waitFor(
        () =>
          run(
            `(() => {const matches=[...document.querySelectorAll('[role="button"]')].filter(x => (x.getAttribute('aria-label') || x.textContent.trim()) === ${JSON.stringify(label)}); const b=${JSON.stringify('Install provider')} === ${JSON.stringify(label)} ? matches.at(-1) : matches[0]; if(!b || b.getAttribute('aria-disabled') === 'true') return false; b.click(); return true;})()`,
          ),
        label,
      );
    const toggle = (label) =>
      run(
        `(() => {const b=document.querySelector('[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']'); if(!b) throw new Error('Toggle missing'); b.click();})()`,
      );
    const fill = (placeholder, value) =>
      run(
        `(() => {const input=document.querySelector('input[placeholder=' + ${JSON.stringify(JSON.stringify(placeholder))} + ']'); if(!input) throw new Error('Input missing: ' + ${JSON.stringify(placeholder)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
    await waitFor(
      async () =>
        !window.webContents.isLoading() &&
        (await text()).includes('Your next story starts here.'),
      'onboarding',
    );
    await click('Let’s explore');
    await click('Providers');
    await click('Install from URL');
    await fill(
      'https://your-server/provider.cfprovider',
      'http://127.0.0.1:' + server.address().port + '/provider',
    );
    await click('Review provider');
    await waitFor(
      async () => (await text()).includes('Requests the media agent'),
      'agent permission review',
    );
    await click('Install provider');
    await waitFor(
      async () => (await text()).includes('Media Research installed'),
      'installed',
    );
    await click('Settings');
    await waitFor(
      async () => (await text()).includes('Allow Media Research'),
      'agent settings',
    );
    await fill('Enter API key', key);
    await click('Save API key');
    await waitFor(
      async () => (await text()).includes('API key saved.'),
      'key saved',
    );
    await toggle('Enable media agent');
    await toggle('Allow Media Research');
    await click('Save agent settings');
    await waitFor(
      async () => (await text()).includes('Agent settings saved.'),
      'settings saved',
    );
    const stored = await run('Object.values(localStorage).join("\\n")');
    assert.ok(!stored.includes(key));
    const encrypted = await fs.readFile(
      path.join(userData, 'credentials', 'cinefern.secret.agent.openai.bin'),
    );
    assert.ok(!encrypted.includes(Buffer.from(key)));
    await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
    await run(
      `Array.from(document.querySelectorAll('div')).find(e => e.children.length === 0 && e.textContent === 'Media agent')?.scrollIntoView({block:'start'})`,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    await fs.writeFile(
      path.join(root, 'artifacts/agent-settings.png'),
      (await window.webContents.capturePage()).toPNG(),
    );
    window.webContents.reload();
    await waitFor(
      async () =>
        !window.webContents.isLoading() && (await text()).includes('Discover'),
      'restored',
    );
    await click('Search');
    await click('Media Research');
    const placeholder = await run(
      'document.querySelector("input")?.placeholder',
    );
    await fill(placeholder, 'Sintel research fixture');
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.equal(counts.models, 0, 'typing must not trigger paid agent calls');
    await click('Search with agents');
    await waitFor(
      async () => (await text()).includes('Sintel Research Fixture'),
      'agent search result',
      30000,
    );
    assert.deepEqual(counts, {
      models: 4,
      searches: 1,
      pages: 2,
      forbiddenPosts: 0,
    });
    await fs.writeFile(
      path.join(root, 'artifacts/agent-search.png'),
      (await window.webContents.capturePage()).toPNG(),
    );
    await click('Settings');
    await waitFor(
      async () => (await text()).includes('Remove API key'),
      'restored key status',
    );
    await click('Remove API key');
    await waitFor(
      async () => (await text()).includes('API key removed.'),
      'key removed',
    );
    await assert.rejects(
      fs.stat(
        path.join(userData, 'credentials', 'cinefern.secret.agent.openai.bin'),
      ),
    );
    console.log(
      JSON.stringify({
        encryptedKeyStorage: true,
        reconnectAfterReload: true,
        explicitSearch: true,
        deepAgentsToolLoop: true,
        renderedBrowser: true,
        postRequestsBlocked: true,
        keyRemoval: true,
        counts,
      }),
    );
    server.close();
    app.exit(0);
  } catch (error) {
    console.error(error);
    if (window && !window.isDestroyed()) {
      console.error(
        (
          await window.webContents.executeJavaScript('document.body.innerText')
        ).slice(-7000),
      );
      await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
      await fs.writeFile(
        path.join(root, 'artifacts/agent-failure.png'),
        (await window.webContents.capturePage()).toPNG(),
      );
    }
    server.close();
    app.exit(1);
  }
});
