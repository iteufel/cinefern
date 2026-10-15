const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

// Expo owns the scene window and forwards links and lifecycle events to its
// subscribers. Creating a second window in AppDelegate breaks that lifecycle.
function adoptScenes(source) {
  if (
    source.includes(
      'AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider',
    )
  ) {
    return source;
  }
  const legacyWindow =
    /#if os\(iOS\) \|\| os\(tvOS\)\s+window = UIWindow\(frame: UIScreen\.main\.bounds\)\s+factory\.startReactNative\([\s\S]*?launchOptions: launchOptions\)\s+#endif/;
  if (
    !source.includes('class AppDelegate: ExpoAppDelegate {') ||
    !legacyWindow.test(source)
  ) {
    throw new Error(
      'The Apple scene plugin requires the Expo Swift AppDelegate template.',
    );
  }
  return source
    .replace(
      'class AppDelegate: ExpoAppDelegate {',
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
    )
    .replace(
      legacyWindow,
      '// ExpoAppSceneDelegate creates the window and starts React Native.',
    );
}

module.exports = (config) => {
  config = withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
          },
        ],
      },
    };
    return config;
  });
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      throw new Error('The Apple scene plugin requires a Swift AppDelegate.');
    }
    config.modResults.contents = adoptScenes(config.modResults.contents);
    return config;
  });
};
module.exports.adoptScenes = adoptScenes;
