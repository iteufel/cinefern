import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const run = (...args) =>
  execFileSync(args[0], args.slice(1), { cwd: root, stdio: 'inherit' });
run('npm', 'ci', '--prefix', 'native/Runtime', '--ignore-scripts');
run('node', 'native/scripts/build-runtime.mjs');
const icon = resolve(
  root,
  'native/Resources/Assets.xcassets/AppIcon.appiconset',
);
mkdirSync(icon, { recursive: true });
copyFileSync(resolve(root, 'assets/icon.png'), resolve(icon, 'icon.png'));
writeFileSync(
  resolve(root, 'native/Sources/Core/Resources/Acknowledgements.txt'),
  'Cinefern native Apple client — https://github.com/iteufel/cinefern\n\n' +
    readFileSync(resolve(root, 'LICENSE'), 'utf8') +
    '\n\nOptional MobileVLCKit 3.7.4 / VLCKit\nSource: https://code.videolan.org/videolan/VLCKit/-/tree/3.7.4\n' +
    readFileSync(resolve(root, 'native/Resources/VLCKit-LICENSE.txt'), 'utf8') +
    '\n\nBundled JavaScript dependencies\n' +
    readFileSync(
      resolve(root, 'native/Sources/Core/Resources/runtime.js.LEGAL.txt'),
      'utf8',
    ),
);
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
