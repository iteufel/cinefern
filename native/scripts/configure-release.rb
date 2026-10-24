# Configure only the native iOS application's Release configuration. Pods and
# development bundle IDs remain independent of the production signing profile.
require 'xcodeproj'
root = File.expand_path('..', __dir__)
version = ENV.fetch('MARKETING_VERSION')
build = ENV.fetch('BUILD_NUMBER')
team = ENV.fetch('APPLE_TEAM_ID')
profile = ENV.fetch('PROFILE_UUID')
raise 'Invalid marketing version' unless version.match?(/\A\d+\.\d+\.\d+\z/)
raise 'Invalid build number' unless build.match?(/\A\d{1,4}\.\d{1,2}\z/)
raise 'Invalid team' unless team.match?(/\A[A-Z0-9]{10}\z/)
raise 'Invalid profile UUID' unless profile.match?(/\A[0-9A-Fa-f-]{36}\z/)
project = Xcodeproj::Project.open(File.join(root, 'CinefernVLC.xcodeproj'))
target = project.native_targets.find { |item| item.name == 'Cinefern-iOS' }
release = target.build_configurations.find { |config| config.name == 'Release' }
release.build_settings.merge!({
  'PRODUCT_BUNDLE_IDENTIFIER' => 'io.github.iteufel.cinefern',
  'MARKETING_VERSION' => version, 'CURRENT_PROJECT_VERSION' => build,
  'CODE_SIGN_STYLE' => 'Manual', 'DEVELOPMENT_TEAM' => team,
  'CODE_SIGN_IDENTITY' => 'Apple Distribution',
  'PROVISIONING_PROFILE_SPECIFIER' => profile,
})
project.save
