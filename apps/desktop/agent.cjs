const { BrowserWindow, session, net } = require('electron');
const { lookup } = require('node:dns/promises');
const { randomUUID } = require('node:crypto');

const endpoints = new Set(
  [
    'https://api.openai.com/v1',
    'https://api.x.ai/v1',
    'https://openrouter.ai/api/v1',
  ].flatMap((base) => [base + '/responses', base + '/chat/completions']),
);
const active = new Map();
function publicUrl(value) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    value.length > 2048 ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !host.includes('.') ||
    /^[\d.]+$/.test(host) ||
    host.includes(':') ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(
      host,
    )
  )
    throw new Error('Agent browsing requires a public HTTPS website.');
  return url.href;
}
function publicAddress(address) {
  if (address.includes(':'))
    return (
      /^(?:2|3)[0-9a-f]{3}:/i.test(address) &&
      !/^2001:(?:db8|0):/i.test(address)
    );
  const [a, b] = address.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
async function checkPublic(value) {
  const url = publicUrl(value);
  const addresses = await lookup(new URL(url).hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => !publicAddress(address))
  )
    throw new Error('Agent browsing cannot access a private network.');
  return url;
}
function registerAgentHandlers(handle) {
  handle('agent:cancel', (_, id) => active.get(id)?.());
  handle('agent:request', async (_, id, url, options) => {
    if (
      typeof id !== 'string' ||
      active.has(id) ||
      active.size > 10 ||
      !endpoints.has(url) ||
      options?.method !== 'POST' ||
      typeof options.body !== 'string' ||
      options.body.length > 200000
    )
      throw new Error('Invalid AI request.');
    const controller = new AbortController();
    active.set(id, () => controller.abort());
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await net.fetch(url, {
        method: 'POST',
        body: options.body,
        headers: options.headers,
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
      });
      const reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 1000000) {
          await reader.cancel();
          throw new Error('AI response is too large.');
        }
        chunks.push(Buffer.from(value));
      }
      return {
        status: response.status,
        ok: response.ok,
        headers: Object.fromEntries(response.headers),
        body: Buffer.concat(chunks).toString('utf8'),
      };
    } finally {
      clearTimeout(timer);
      active.delete(id);
    }
  });
  handle('agent:browse', async (_, id, value) => {
    if (typeof id !== 'string' || active.has(id) || active.size > 10)
      throw new Error('Browser is busy.');
    // Reserve before DNS lookup, so cancellation also works while resolving the host.
    let browser;
    let isolated;
    let cancelled = false;
    let deadline;
    active.set(id, () => {
      cancelled = true;
      if (browser && !browser.isDestroyed()) browser.destroy();
    });
    try {
      const url = await checkPublic(value);
      if (cancelled) throw new Error('Browser cancelled.');
      isolated = session.fromPartition('cinefern-agent-' + randomUUID());
      isolated.setPermissionRequestHandler((_, __, callback) =>
        callback(false),
      );
      isolated.setPermissionCheckHandler(() => false);
      isolated.on('will-download', (event) => event.preventDefault());
      isolated.webRequest.onBeforeRequest((details, callback) => {
        if (
          cancelled ||
          !['GET', 'HEAD'].includes(details.method) ||
          ['webSocket', 'object', 'media'].includes(details.resourceType)
        )
          return callback({ cancel: true });
        checkPublic(details.url).then(
          () => callback({ cancel: cancelled }),
          () => callback({ cancel: true }),
        );
      });
      isolated.webRequest.onBeforeSendHeaders((details, callback) => {
        const headers = { ...details.requestHeaders };
        for (const key of Object.keys(headers))
          if (/^(cookie|authorization|proxy-authorization)$/i.test(key))
            delete headers[key];
        callback({ requestHeaders: headers });
      });
      browser = new BrowserWindow({
        show: false,
        width: 1200,
        height: 800,
        webPreferences: {
          session: isolated,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          devTools: false,
          backgroundThrottling: false,
          navigateOnDragDrop: false,
        },
      });
      browser.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      browser.webContents.on('will-attach-webview', (event) =>
        event.preventDefault(),
      );
      browser.webContents.on('will-navigate', (event, target) => {
        try {
          publicUrl(target);
        } catch {
          event.preventDefault();
        }
      });
      deadline = setTimeout(() => {
        cancelled = true;
        if (!browser.isDestroyed()) browser.destroy();
      }, 20000);
      await browser.loadURL(url);
      // Give client-rendered text a short, bounded opportunity to settle.
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (cancelled || browser.isDestroyed())
        throw new Error('Browser cancelled or timed out.');
      const page = await browser.webContents.executeJavaScript(`(() => {
        const valid = value => { try { const u = new URL(value, location.href); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; } };
        return { url: location.href, title: document.title.slice(0,300), text: (document.body?.innerText || '').slice(0,16000), mode: 'rendered',
          links: Array.from(document.querySelectorAll('a[href]')).map(a => ({url: valid(a.href), title: (a.innerText || a.href).slice(0,180)})).filter(a => a.url).slice(0,60),
          media: Array.from(document.querySelectorAll('video, video source')).map(v => valid(v.currentSrc || v.src)).filter(Boolean).slice(0,20) };
      })()`);
      page.url = publicUrl(page.url);
      page.links = page.links.filter((link) => {
        try {
          publicUrl(link.url);
          return true;
        } catch {
          return false;
        }
      });
      page.media = page.media.filter((src) => {
        try {
          publicUrl(src);
          return true;
        } catch {
          return false;
        }
      });
      return page;
    } finally {
      clearTimeout(deadline);
      active.delete(id);
      if (browser && !browser.isDestroyed()) browser.destroy();
      if (isolated) {
        await isolated.clearStorageData();
        await isolated.closeAllConnections();
      }
    }
  });
}
module.exports = { registerAgentHandlers, publicUrl, publicAddress };
