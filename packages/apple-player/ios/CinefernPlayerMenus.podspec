require 'json'
package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))
Pod::Spec.new do |s|
  s.name = 'CinefernPlayerMenus'
  s.version = package['version']
  s.summary = package['description']
  s.description = package['description']
  s.license = package['license']
  s.author = 'Cinefern contributors'
  s.homepage = 'https://github.com/iteufel/cinefern'
  s.source = { git: 'https://github.com/iteufel/cinefern.git' }
  s.platforms = { :ios => '16.4', :tvos => '16.4' }
  s.dependency 'ExpoModulesCore'
  s.static_framework = true
  s.source_files = '**/*.swift'
end
