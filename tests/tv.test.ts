import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBundle } from '@cinefern/provider-sdk';
import { fetchTextDocument } from '../src/core/import-document';
import { remotePlaybackAction } from '../src/player/remote';

test('remote playback ignores key releases and leaves focus navigation to visible controls', () => {
  assert.equal(
    remotePlaybackAction(
      { eventType: 'playPause', eventKeyAction: 0 },
      true,
      false,
    ),
    'toggle',
  );
  assert.equal(
    remotePlaybackAction(
      { eventType: 'playPause', eventKeyAction: 1 },
      true,
      false,
    ),
    undefined,
  );
  assert.equal(
    remotePlaybackAction({ eventType: 'left' }, false, false),
    'backward',
  );
  assert.equal(
    remotePlaybackAction({ eventType: 'longRight' }, false, false),
    'forward',
  );
  assert.equal(
    remotePlaybackAction({ eventType: 'left' }, true, false),
    undefined,
  );
  assert.equal(
    remotePlaybackAction({ eventType: 'down' }, false, false),
    'show',
  );
  assert.equal(
    remotePlaybackAction({ eventType: 'playPause' }, false, true),
    undefined,
  );
  assert.equal(
    remotePlaybackAction({ eventType: 'select' }, false, false),
    undefined,
  );
});

test('URL imports reject unsafe schemes, credentials, failed downloads and oversized documents', async () => {
  const response = { ok: true, status: 200, headers: {}, body: '{}' };
  let requests = 0;
  const request = async () => {
    requests++;
    return response;
  };
  for (const url of [
    'file:///private/data',
    'javascript:alert(1)',
    'https://name:password@example.com/bundle',
  ]) {
    await assert.rejects(fetchTextDocument(url, request), /HTTP\(S\)/);
  }
  assert.equal(requests, 0);
  await assert.rejects(
    fetchTextDocument('https://example.com/provider', async () => ({
      ...response,
      ok: false,
      status: 404,
    })),
    /404/,
  );
  await assert.rejects(
    fetchTextDocument('https://example.com/provider', async () => ({
      ...response,
      body: 'x'.repeat(2_000_001),
    })),
    /2 MB/,
  );
});

test('a hosted provider is parsed for review without executing its code', async () => {
  const code = 'throw new Error("must not run during review");';
  const manifest = {
    id: 'org.example.tv',
    name: 'TV films',
    description: 'A remote catalog',
    author: 'Tests',
    version: '1.0.0',
    apiVersion: 1,
    capabilities: [],
    permissions: { network: ['https://example.com'], storage: false },
  };
  const body = JSON.stringify({ format: 'cinefern-provider', manifest, code });
  const text = await fetchTextDocument(
    ' https://example.com/tv.cfprovider ',
    async (url) => {
      assert.equal(url, 'https://example.com/tv.cfprovider');
      return { ok: true, status: 200, headers: {}, body };
    },
  );
  assert.equal(parseBundle(text).code, code);
});
