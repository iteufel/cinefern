import { build } from 'esbuild';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const aliases = {
  'node:crypto': 'src/agent/compat/crypto.ts',
  'langsmith/experimental/sandbox': 'src/agent/compat/sandbox.ts',
  'langchain/chat_models/universal': 'src/agent/compat/models.ts',
  '@langchain/langgraph': 'node_modules/@langchain/langgraph/dist/web.js',
  path: 'node_modules/path-browserify/index.js',
  'node:path': 'node_modules/path-browserify/index.js',
  util: 'node_modules/util/util.js',
  'node:util': 'node_modules/util/util.js',
};
await build({
  absWorkingDir: root,
  entryPoints: ['native/Runtime/index.ts'],
  outfile: 'native/Sources/Core/Resources/runtime.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'safari17',
  conditions: ['browser'],
  mainFields: ['browser', 'module', 'main'],
  define: {
    global: 'globalThis',
    'process.env.NODE_ENV': '"production"',
    'process.env': '{}',
    'process.version': '""',
  },
  plugins: [
    {
      name: 'native-agent',
      setup(build) {
        build.onResolve({ filter: /./ }, (args) => {
          if (aliases[args.path])
            return { path: resolve(root, aliases[args.path]) };
          if (
            args.importer.includes('/langchain/') &&
            /chat_models\/universal\.js$/.test(args.path)
          )
            return { path: resolve(root, 'src/agent/compat/models.ts') };
        });
      },
    },
  ],
  legalComments: 'linked',
});
