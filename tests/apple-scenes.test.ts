import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { adoptScenes } = require('../plugins/with-apple-scenes.cjs') as {
  adoptScenes(source: string): string;
};

const appDelegate = `
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?
  var reactNativeFactory: RCTReactNativeFactory?
  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let factory = ExpoReactNativeFactory(delegate: delegate)
    reactNativeFactory = factory
    bindReactNativeFactory(factory)
    #if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
    #endif
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

test('Apple scene adoption gives Expo ownership of window creation without losing the factory', () => {
  const result = adoptScenes(appDelegate);
  assert.match(
    result,
    /AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider/,
  );
  assert.match(result, /reactNativeFactory = factory/);
  assert.match(result, /bindReactNativeFactory\(factory\)/);
  assert.match(result, /return super.application/);
  assert.doesNotMatch(result, /UIScreen.main|factory.startReactNative/);
  assert.equal(adoptScenes(result), result);
});

test('Apple scene adoption rejects a changed template instead of generating a broken app', () => {
  assert.throws(
    () =>
      adoptScenes(
        appDelegate.replace('factory.startReactNative', 'factory.launch'),
      ),
    /requires the Expo Swift AppDelegate template/,
  );
  assert.throws(
    () => adoptScenes('@implementation AppDelegate'),
    /requires the Expo Swift AppDelegate template/,
  );
});
