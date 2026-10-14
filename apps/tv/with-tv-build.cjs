const { withPodfileProperties } = require('expo/config-plugins');

// Build the TV fork and Expo modules for tvOS, instead of using iOS-only
// precompiled artifacts. Keep this change scoped to the Apple TV project.
module.exports = (config) =>
  withPodfileProperties(config, (config) => {
    config.modResults['ios.buildReactNativeFromSource'] = 'true';
    config.modResults.EXPO_USE_PRECOMPILED_MODULES = 'false';
    return config;
  });
