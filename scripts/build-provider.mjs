import { build } from 'esbuild';
import { transformSync } from '@babel/core';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const [entry, manifestPath, outputPath] = process.argv.slice(2);
if (!entry || !manifestPath) {
  console.error(
    'Usage: npm run plugin:build -- provider.ts manifest.json [output.cfprovider]',
  );
  process.exit(1);
}
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.apiVersion !== 1 || !/^[a-z][a-z0-9.-]{2,79}$/.test(manifest.id))
  throw new Error('Invalid provider manifest.');
const result = await build({
  stdin: {
    contents:
      'import provider from ' +
      JSON.stringify(resolve(entry)) +
      '; CinefernProvider = provider;',
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2018',
  legalComments: 'inline',
  treeShaking: true,
});
// The interpreter follows ES2017 but requires reserved property names to be quoted.
const code =
  'var CinefernProvider;\n' +
  transformSync(result.outputFiles[0].text, {
    configFile: false,
    babelrc: false,
    plugins: [
      function interpreterMethods({ types }) {
        return {
          visitor: {
            ObjectMethod(path) {
              const node = path.node;
              if (node.kind !== 'method') return;
              path.replaceWith(
                types.objectProperty(
                  node.key,
                  types.functionExpression(
                    null,
                    node.params,
                    node.body,
                    node.generator,
                    node.async,
                  ),
                  node.computed,
                ),
              );
            },
          },
        };
      },
      '@babel/plugin-transform-property-literals',
    ],
  }).code;
const bundle = JSON.stringify({ format: 'cinefern-provider', manifest, code });
if (bundle.length > 2_000_000)
  throw new Error('Provider bundles must be smaller than 2 MB.');
const destination = resolve(
  outputPath || 'dist-providers/' + manifest.id + '.cfprovider',
);
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, bundle);
console.log('Built ' + manifest.name + ' → ' + destination);
