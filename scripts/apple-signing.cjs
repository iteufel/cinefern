// Change only the generated app target. Passing a provisioning profile globally
// to xcodebuild also forces it onto CocoaPods targets, which cannot use it.
const fs = require('node:fs');
const path = require('node:path');
const { IOSConfig } = require('expo/config-plugins');

const { APP_ROOT, APP_SCHEME, APPLE_TEAM_ID, PROFILE_UUID, BUILD_NUMBER } =
  process.env;
if (!/^\d{1,4}\.\d{1,2}$/.test(BUILD_NUMBER || '')) {
  throw new Error(
    'BUILD_NUMBER must be <run number>.<attempt> (up to 9999.99).',
  );
}
if (!APPLE_TEAM_ID || !PROFILE_UUID) {
  throw new Error('APPLE_TEAM_ID and PROFILE_UUID are required.');
}
const root = path.resolve(APP_ROOT);
const utils = IOSConfig.XcodeUtils;
const project = utils.getPbxproj(root);
const { target } = utils.getApplicationNativeTarget({
  project,
  projectName: APP_SCHEME,
});
const [, release] = utils.getBuildConfigurationForListIdAndName(project, {
  configurationListId: target.buildConfigurationList,
  buildConfiguration: 'Release',
});
Object.assign(release.buildSettings, {
  CODE_SIGN_STYLE: 'Manual',
  DEVELOPMENT_TEAM: APPLE_TEAM_ID,
  CODE_SIGN_IDENTITY: '"Apple Distribution"',
  PROVISIONING_PROFILE_SPECIFIER: PROFILE_UUID,
  CURRENT_PROJECT_VERSION: BUILD_NUMBER,
});
fs.writeFileSync(project.filepath, project.writeSync());

// Expo writes a literal CFBundleVersion into Info.plist; keep it in sync with
// CURRENT_PROJECT_VERSION so archive/export cannot reuse the previous build.
const infoPlist = path.join(root, 'ios', APP_SCHEME, 'Info.plist');
const plist = fs.readFileSync(infoPlist, 'utf8');
const updated = plist.replace(
  /(<key>CFBundleVersion<\/key>\s*<string>)[^<]*(<\/string>)/,
  (_, before, after) => `${before}${BUILD_NUMBER}${after}`,
);
if (updated === plist && !plist.includes(`<string>${BUILD_NUMBER}</string>`)) {
  throw new Error('CFBundleVersion was not found in the generated Info.plist.');
}
fs.writeFileSync(infoPlist, updated);
