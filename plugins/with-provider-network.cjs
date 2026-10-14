const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

// Users can choose local HTTP media servers, including Jellyfin's default port 8096.
module.exports = (config) =>
  withAndroidManifest(config, (config) => {
    AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults).$[
      'android:usesCleartextTraffic'
    ] = 'true';
    return config;
  });
