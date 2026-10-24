// Uses only the CI environment's existing App Store Connect key. No token/key is logged.
import { sign } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const env = process.env;
const appId = '6822936078';
const bundleId = 'io.github.iteufel.cinefern';
const marketingVersion = env.MARKETING_VERSION;
if (!/^\d+\.\d+\.\d+$/.test(marketingVersion ?? ''))
  throw new Error('Invalid marketing version.');
const versionParts = (v) => v.split('.').map(Number);
function newer(a, b) {
  const x = versionParts(a),
    y = versionParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}
function token() {
  const now = Math.floor(Date.now() / 1000);
  const encode = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const data =
    encode({ alg: 'ES256', kid: env.APP_STORE_CONNECT_KEY_ID, typ: 'JWT' }) +
    '.' +
    encode({
      iss: env.APP_STORE_CONNECT_ISSUER_ID,
      iat: now,
      exp: now + 600,
      aud: 'appstoreconnect-v1',
    });
  return (
    data +
    '.' +
    sign('sha256', Buffer.from(data), {
      key: env.APP_STORE_CONNECT_PRIVATE_KEY,
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url')
  );
}
async function api(path, params = {}) {
  const url = new URL(path, 'https://api.appstoreconnect.apple.com');
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token()}` },
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(`App Store Connect request failed (${response.status}).`);
  return response.json();
}
function output(name, value) {
  if (env.GITHUB_OUTPUT)
    appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`);
}
const app = await api(`/v1/apps/${appId}`, { 'fields[apps]': 'name,bundleId' });
if (app.data?.attributes?.bundleId !== bundleId)
  throw new Error('App Store app/bundle identity mismatch.');
const mode = process.argv[2];
if (mode === 'prepare') {
  const data = await api('/v1/builds', {
    'filter[app]': appId,
    'filter[preReleaseVersion.platform]': 'IOS',
    include: 'preReleaseVersion',
    limit: '200',
    sort: '-uploadedDate',
  });
  if (
    (data.included ?? []).some((v) =>
      newer(v.attributes.version, marketingVersion),
    )
  ) {
    throw new Error(
      'Requested version is older than an existing iOS TestFlight version.',
    );
  }
  const major = Math.max(
    0,
    ...data.data.map((b) => Number(b.attributes.version.split('.')[0])),
  );
  const attempt = Number(env.GITHUB_RUN_ATTEMPT ?? '1');
  if (
    !Number.isInteger(major) ||
    major >= 9999 ||
    !Number.isInteger(attempt) ||
    attempt < 1 ||
    attempt > 99
  ) {
    throw new Error('Cannot allocate a valid increasing build number.');
  }
  const build = `${major + 1}.${attempt}`;
  output('build_number', build);
  console.log(
    `Confirmed ${bundleId}; preparing ${marketingVersion} (${build}).`,
  );
} else if (mode === 'wait') {
  const build = env.BUILD_NUMBER;
  if (!/^\d{1,4}\.\d{1,2}$/.test(build ?? ''))
    throw new Error('Invalid expected build number.');
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    const result = await api('/v1/builds', {
      'filter[app]': appId,
      'filter[version]': build,
      include: 'preReleaseVersion,buildBetaDetail',
      limit: '10',
    });
    const match = result.data.find((b) => {
      const pre = result.included?.find(
        (p) =>
          p.type === 'preReleaseVersions' &&
          p.id === b.relationships.preReleaseVersion.data.id,
      );
      return (
        pre?.attributes.version === marketingVersion &&
        pre.attributes.platform === 'IOS'
      );
    });
    const state = match?.attributes.processingState ?? 'NOT_VISIBLE_YET';
    console.log(`TestFlight ${marketingVersion} (${build}): ${state}`);
    if (state === 'FAILED' || state === 'INVALID')
      throw new Error(`Apple rejected build processing: ${state}.`);
    if (state === 'VALID') {
      const beta =
        result.included?.find(
          (v) =>
            v.type === 'buildBetaDetails' &&
            v.relationships?.build?.data?.id === match.id,
        ) ?? result.included?.find((v) => v.type === 'buildBetaDetails');
      const evidence = {
        sourceCommit: env.GITHUB_SHA,
        appId,
        bundleId,
        marketingVersion,
        buildNumber: build,
        buildId: match.id,
        processingState: state,
        usesNonExemptEncryption: match.attributes.usesNonExemptEncryption,
        internalBuildState: beta?.attributes.internalBuildState,
        checkedAt: new Date().toISOString(),
      };
      writeFileSync(
        resolve(env.BUILD_DIR, 'testflight-result.json'),
        JSON.stringify(evidence, null, 2) + '\n',
      );
      output('build_id', match.id);
      if (env.GITHUB_STEP_SUMMARY)
        appendFileSync(
          env.GITHUB_STEP_SUMMARY,
          `## TestFlight processed\n\nCinefern ${marketingVersion} (${build}), iOS/iPadOS, native SwiftUI + AVKit/VLC.\n\nApple processing: **VALID**.\n\n[App Store Connect](https://appstoreconnect.apple.com/apps/${appId}/testflight/ios)\n`,
        );
      break;
    }
    await delay(30000);
  }
  if (Date.now() >= deadline)
    throw new Error('Apple processing is still pending after 30 minutes.');
} else throw new Error('Expected prepare or wait.');
