const path = require('node:path');
const root = path.resolve(__dirname, '..');

/** Narrow browser adaptations shared by mobile, tvOS, and the desktop renderer. */
module.exports = function withMediaAgent(config) {
  const previous = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, name, platform) => {
    const origin = context.originModulePath.replace(/\\/g, '/');
    if (name === 'langsmith/experimental/sandbox')
      return {
        type: 'sourceFile',
        filePath: path.join(root, 'src/agent/compat/sandbox.ts'),
      };
    if (
      name === 'langchain/chat_models/universal' ||
      (origin.includes('/langchain/') &&
        /(?:^|\/)chat_models\/universal\.js$/.test(name))
    )
      return {
        type: 'sourceFile',
        filePath: path.join(root, 'src/agent/compat/models.ts'),
      };
    if (name === 'node:crypto')
      return {
        type: 'sourceFile',
        filePath: path.join(root, 'src/agent/compat/crypto.ts'),
      };
    if (name === 'util' || name === 'node:util')
      return { type: 'sourceFile', filePath: require.resolve('util/') };
    if (name === 'path' || name === 'node:path')
      return {
        type: 'sourceFile',
        filePath: require.resolve('path-browserify'),
      };
    // LangGraph's web entry point avoids Node AsyncLocalStorage on Hermes.
    if (name === '@langchain/langgraph')
      return {
        type: 'sourceFile',
        filePath: path.join(
          root,
          'node_modules/@langchain/langgraph/dist/web.js',
        ),
      };
    return previous
      ? previous(context, name, platform)
      : context.resolveRequest(context, name, platform);
  };
  return config;
};
