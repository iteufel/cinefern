require 'xcodeproj'
root=File.expand_path('..',__dir__)
project_name=ARGV.include?('--vlc') ? 'CinefernVLC.xcodeproj' : 'Cinefern.xcodeproj'
project=Xcodeproj::Project.new(File.join(root,project_name))
project.root_object.attributes['LastUpgradeCheck']='2710'
group=project.main_group.new_group('Sources')
files=Dir[File.join(root,'Sources/{Core,App}/**/*.swift')].sort.map { |path| group.new_file(path.delete_prefix(root+'/')) }
resources=Dir[File.join(root,'Sources/Core/Resources/*')].sort.map { |path| group.new_file(path.delete_prefix(root+'/')) }
icons=project.main_group.new_file('Resources/Assets.xcassets')
privacy=project.main_group.new_file('Resources/PrivacyInfo.xcprivacy')
[['Cinefern-iOS',:ios,'17.0','iphoneos'],['Cinefern-macOS',:osx,'14.0','macosx'],['Cinefern-tvOS',:tvos,'17.0','appletvos']].each do |name,platform,version,sdk|
  target=project.new_target(:application,name,platform,version)
  target.add_file_references(files)
  resources.each { |ref| target.resources_build_phase.add_file_reference(ref) }
  target.resources_build_phase.add_file_reference(privacy)
  target.resources_build_phase.add_file_reference(icons) if platform==:ios
  target.build_configurations.each do |config|
    config.build_settings.merge!({
      'PRODUCT_BUNDLE_IDENTIFIER'=>"org.cinefern.native.#{platform}",
      'PRODUCT_NAME'=>'Cinefern', 'SWIFT_VERSION'=>'5.0',
      'GENERATE_INFOPLIST_FILE'=>'YES', 'INFOPLIST_FILE'=>'Info.plist',
      'MARKETING_VERSION'=>'0.1.0', 'CURRENT_PROJECT_VERSION'=>'1',
      'CODE_SIGN_STYLE'=>'Automatic', 'ENABLE_USER_SCRIPT_SANDBOXING'=>'YES',
      'SDKROOT'=>sdk,
      'SWIFT_EMIT_LOC_STRINGS'=>'YES', 'CLANG_ENABLE_MODULES'=>'YES',
      'ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS'=>'YES',
    })
    if platform==:ios
      config.build_settings['ASSETCATALOG_COMPILER_APPICON_NAME']='AppIcon'
      config.build_settings['TARGETED_DEVICE_FAMILY']='1,2'
      config.build_settings['SUPPORTED_PLATFORMS']='iphoneos iphonesimulator'
      config.build_settings['SUPPORTS_MACCATALYST']='NO'
      config.build_settings['INFOPLIST_KEY_UIApplicationSceneManifest_Generation']='YES'
      config.build_settings['INFOPLIST_KEY_UILaunchScreen_Generation']='YES'
    elsif platform==:tvos
      config.build_settings['TARGETED_DEVICE_FAMILY']='3'
      config.build_settings['SUPPORTED_PLATFORMS']='appletvos appletvsimulator'
    else
      config.build_settings['ENABLE_HARDENED_RUNTIME']='YES'
      config.build_settings['CODE_SIGN_ENTITLEMENTS']='macOS.entitlements'
    end
  end
  if platform==:ios
    ui=project.new_target(:ui_test_bundle,'Cinefern-UITests',:ios,'17.0')
    ui.add_dependency(target)
    ui.add_file_references(Dir[File.join(root,'Tests/UITests/*.swift')].sort.map { |path| group.new_file(path.delete_prefix(root+'/')) })
    ui.build_configurations.each do |config|
      config.build_settings.merge!({'PRODUCT_BUNDLE_IDENTIFIER'=>'org.cinefern.native.uitests','SWIFT_VERSION'=>'5.0','GENERATE_INFOPLIST_FILE'=>'YES','TEST_TARGET_NAME'=>name,'CODE_SIGN_STYLE'=>'Automatic','TARGETED_DEVICE_FAMILY'=>'1,2','SUPPORTED_PLATFORMS'=>'iphoneos iphonesimulator'})
    end
  end
  scheme=Xcodeproj::XCScheme.new
  scheme.add_build_target(target)
  scheme.set_launch_target(target)
  scheme.add_test_target(ui) if platform==:ios
  scheme.save_as(project.path,name,true)
end
project.predictabilize_uuids
project.save
