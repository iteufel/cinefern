import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const run = (...args) =>
  execFileSync(args[0], args.slice(1), { cwd: root, stdio: 'inherit' });
run('npm', 'ci', '--prefix', 'native/Runtime', '--ignore-scripts');
run('node', 'native/scripts/build-runtime.mjs');
run('npm', 'run', 'plugin:example');
run('npm', 'run', 'plugin:agent-example');
const fixtures = resolve(root, 'native/Tests/CoreTests/Fixtures');
mkdirSync(fixtures, { recursive: true });
for (const name of ['org.example.catalog', 'org.cinefern.media-research'])
  copyFileSync(
    resolve(root, 'dist-providers', name + '.cfprovider'),
    resolve(fixtures, name + '.cfprovider'),
  );
copyFileSync(
  resolve(root, 'providers/example/catalog.json'),
  resolve(fixtures, 'catalog.json'),
);
