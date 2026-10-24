import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
});
let count = 0;
async function run(mode, replies) {
  const dir = mkdtempSync(join(tmpdir(), 'cinefern-asc-test-'));
  const saved = { ...process.env },
    argv = [...process.argv],
    originalFetch = globalThis.fetch;
  Object.assign(process.env, {
    MARKETING_VERSION: '5.2.0',
    BUILD_NUMBER: '6.1',
    BUILD_DIR: dir,
    GITHUB_OUTPUT: join(dir, 'outputs'),
    GITHUB_STEP_SUMMARY: join(dir, 'summary'),
    GITHUB_RUN_ATTEMPT: '1',
    APP_STORE_CONNECT_KEY_ID: 'fixture',
    APP_STORE_CONNECT_ISSUER_ID: 'fixture',
    APP_STORE_CONNECT_PRIVATE_KEY: privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }),
  });
  process.argv[2] = mode;
  globalThis.fetch = async (url, options) => {
    assert.equal(url.origin, 'https://api.appstoreconnect.apple.com');
    assert.equal(options.redirect, 'error');
    const jwt = options.headers.Authorization.replace('Bearer ', '').split('.');
    assert.ok(
      verify(
        'sha256',
        Buffer.from(jwt.slice(0, 2).join('.')),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(jwt[2], 'base64url'),
      ),
    );
    const body = replies.shift();
    assert.ok(body, 'Unexpected API request');
    return { ok: true, json: async () => body };
  };
  try {
    await import(
      new URL(
        `../../scripts/testflight-status.mjs?test=${++count}`,
        import.meta.url,
      )
    );
    return {
      output: readFileSync(join(dir, 'outputs'), 'utf8'),
      evidence:
        mode === 'wait'
          ? JSON.parse(
              readFileSync(join(dir, 'testflight-result.json'), 'utf8'),
            )
          : null,
    };
  } finally {
    globalThis.fetch = originalFetch;
    process.argv = argv;
    for (const key of Object.keys(process.env))
      if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    rmSync(dir, { recursive: true, force: true });
  }
}
const app = () => ({
  data: { attributes: { bundleId: 'io.github.iteufel.cinefern' } },
});
test('allocates a newer build and signs a valid ES256 request', async () => {
  const result = await run('prepare', [
    app(),
    {
      data: [{ attributes: { version: '5.1' } }],
      included: [{ attributes: { version: '5.1.2' } }],
    },
  ]);
  assert.match(result.output, /build_number=6\.1/);
});
test('refuses a different App Store bundle', async () => {
  await assert.rejects(
    run('prepare', [{ data: { attributes: { bundleId: 'wrong.app' } } }]),
    /identity mismatch/,
  );
});
test('refuses a version downgrade', async () => {
  await assert.rejects(
    run('prepare', [
      app(),
      { data: [], included: [{ attributes: { version: '6.0.0' } }] },
    ]),
    /older/,
  );
});
const build = (state) => ({
  data: [
    {
      id: 'fixture-build',
      attributes: {
        version: '6.1',
        processingState: state,
        usesNonExemptEncryption: false,
      },
      relationships: { preReleaseVersion: { data: { id: 'fixture-version' } } },
    },
  ],
  included: [
    {
      id: 'fixture-version',
      type: 'preReleaseVersions',
      attributes: { version: '5.2.0', platform: 'IOS' },
    },
    {
      id: 'fixture-beta',
      type: 'buildBetaDetails',
      attributes: { internalBuildState: 'READY_FOR_BETA_TESTING' },
    },
  ],
});
test('records Apple VALID state for the exact iOS version/build', async () => {
  const result = await run('wait', [app(), build('VALID')]);
  assert.equal(result.evidence.buildId, 'fixture-build');
  assert.equal(result.evidence.processingState, 'VALID');
  assert.equal(result.evidence.internalBuildState, 'READY_FOR_BETA_TESTING');
});
test('rejects Apple processing failure', async () => {
  await assert.rejects(run('wait', [app(), build('INVALID')]), /rejected/);
});
