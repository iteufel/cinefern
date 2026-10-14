const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../..')];
// tvOS is an iOS platform to Metro. Prefer TV implementations only in this app.
config.resolver.sourceExts = config.resolver.sourceExts.flatMap((extension) => [
  `tv.${extension}`,
  extension,
]);
module.exports = config;
