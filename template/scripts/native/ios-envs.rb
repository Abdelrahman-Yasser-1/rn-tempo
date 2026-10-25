#!/usr/bin/env ruby
# frozen_string_literal: true

# Creates the per-environment iOS build configurations, xcconfigs and shared schemes.
#
# Never edit project.pbxproj by hand: change the tables below and re-run `yarn ios:envs`.
# The script is idempotent: running it twice yields no diff.
#
# Usage (from template/):
#   bundle exec ruby scripts/native/ios-envs.rb \
#     --project ios/TempoApp.xcodeproj --target TempoApp --envs dev:Dev,staging:Staging,prod:Prod
#
# Run `cd ios && bundle exec pod install` afterwards when the configurations changed.

require 'fileutils'
require 'optparse'
require 'xcodeproj'

BASE_BUNDLE_ID = 'com.rntempo.app'

# Per-environment values (docs: specs/PLAN.md section B2). Unknown env keys fall back to derived values.
ENV_META = {
  'dev' => { display_name: 'Tempo Dev', url_scheme: 'tempo-dev', bundle_suffix: '.dev', icon: 'AppIcon-Dev' },
  'staging' => { display_name: 'Tempo Stg', url_scheme: 'tempo-staging', bundle_suffix: '.staging', icon: 'AppIcon-Staging' },
  'prod' => { display_name: 'Tempo', url_scheme: 'tempo', bundle_suffix: '', icon: 'AppIcon' }
}.freeze

# Build settings that the xcconfig files own. They must be removed from the target configurations,
# because explicit target settings take precedence over xcconfig values.
XCCONFIG_OWNED_SETTINGS = %w[PRODUCT_BUNDLE_IDENTIFIER ASSETCATALOG_COMPILER_APPICON_NAME].freeze

options = { bundle_id: BASE_BUNDLE_ID }
OptionParser.new do |o|
  o.on('--project PATH', 'Path to the .xcodeproj') { |v| options[:project] = v }
  o.on('--target NAME', 'App target name') { |v| options[:target] = v }
  o.on('--envs LIST', 'Comma separated key:Suffix pairs, e.g. dev:Dev,staging:Staging,prod:Prod') { |v| options[:envs] = v }
  o.on('--remove LIST', 'Comma separated key:Suffix pairs to remove (configurations, xcconfigs, scheme), e.g. qa:Qa') { |v| options[:remove] = v }
  o.on('--bundle-id ID', "Production bundle identifier (default #{BASE_BUNDLE_ID})") { |v| options[:bundle_id] = v }
end.parse!

%i[project target].each do |key|
  abort "Missing --#{key}" unless options[key]
end
abort 'Missing --envs (or --remove)' unless options[:envs] || options[:remove]

project_path = File.expand_path(options[:project])
ios_dir = File.dirname(project_path)
target_name = options[:target]

def parse_pairs(list, flag)
  list.split(',').map do |pair|
    key, suffix = pair.split(':')
    abort "Invalid #{flag} entry '#{pair}' (expected key:Suffix)" if key.to_s.empty? || suffix.to_s.empty?

    { key: key, suffix: suffix }
  end
end

envs = parse_pairs(options[:envs].to_s, '--envs')
removals = parse_pairs(options[:remove].to_s, '--remove')

def meta_for(env, bundle_id)
  base = ENV_META.fetch(env[:key]) do
    { display_name: "Tempo #{env[:suffix]}", url_scheme: "tempo-#{env[:key]}",
      bundle_suffix: ".#{env[:key]}", icon: "AppIcon-#{env[:suffix]}" }
  end
  base.merge(bundle_id: "#{bundle_id}#{base[:bundle_suffix]}")
end

def write_if_changed(path, content)
  return if File.exist?(path) && File.read(path) == content

  FileUtils.mkdir_p(File.dirname(path))
  File.write(path, content)
end

project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == target_name } || abort("Target #{target_name} not found")

# 0. Removals (idempotent): build configurations, xcconfig files and references, shared scheme.
removals.each do |env|
  names = %w[Debug Release].map { |base| "#{base}-#{env[:suffix]}" }
  [project, target].each do |owner|
    list = owner.build_configuration_list
    list.build_configurations.select { |c| names.include?(c.name) }.each(&:remove_from_project)
    remaining = list.build_configurations.map(&:name)
    if names.include?(list.default_configuration_name)
      list.default_configuration_name = remaining.grep(/\ARelease/).last || remaining.last
    end
  end

  config_group = project.main_group.find_subpath('Config', false)
  %w[shared debug release].each do |kind|
    file_name = "#{env[:suffix]}.#{kind}.xcconfig"
    config_group&.files&.select { |f| f.path == file_name }&.each(&:remove_from_project)
    FileUtils.rm_f(File.join(ios_dir, 'Config', file_name))
  end
  FileUtils.rm_f(File.join(project_path, 'xcshareddata', 'xcschemes', "#{target_name}-#{env[:suffix]}.xcscheme"))
end

if envs.empty?
  project.save
  puts "Removed #{removals.map { |e| "#{target_name}-#{e[:suffix]}" }.join(', ')}"
  exit
end

# 1. Build configurations (project + target level), cloned from Debug / Release.
def clone_configuration(list_owner, name, type, source)
  return if list_owner.build_configurations.any? { |c| c.name == name }

  config = list_owner.add_build_configuration(name, type)
  config.build_settings = Marshal.load(Marshal.dump(source.build_settings)) if source
end

envs.each do |env|
  { debug: 'Debug', release: 'Release' }.each do |type, base_name|
    name = "#{base_name}-#{env[:suffix]}"
    [project, target].each do |owner|
      source = owner.build_configurations.find { |c| c.name == base_name }
      clone_configuration(owner, name, type, source)
    end
  end
end

# 2. xcconfig files + file references, wired as the target's base configuration.
config_group = project.main_group.find_subpath('Config', true)
config_group.set_source_tree('<group>')
config_group.set_path('Config')

def ensure_file_ref(group, file_name)
  group.files.find { |f| f.path == file_name } || group.new_file(file_name)
end

# Entitlements file: universal links are documented only, so `associated-domains` stays empty
# (adding real domains would break unsigned/simulator builds).
entitlements_path = "#{target_name}/#{target_name}.entitlements"
write_if_changed(File.join(ios_dir, entitlements_path), <<~PLIST)
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
  \t<!-- Universal links: add entries such as "applinks:app.example.com" here once the domain and a signing team exist. -->
  \t<key>com.apple.developer.associated-domains</key>
  \t<array/>
  </dict>
  </plist>
PLIST
app_group = project.main_group.find_subpath(target_name, false) || project.main_group
unless app_group.files.any? { |f| f.path == entitlements_path }
  app_group.new_file(entitlements_path)
end

envs.each do |env|
  meta = meta_for(env, options[:bundle_id])
  shared_name = "#{env[:suffix]}.shared.xcconfig"
  write_if_changed(File.join(ios_dir, 'Config', shared_name), <<~XCCONFIG)
    // Generated by scripts/native/ios-envs.rb. Do not edit by hand.
    PRODUCT_BUNDLE_IDENTIFIER = #{meta[:bundle_id]}
    APP_DISPLAY_NAME = #{meta[:display_name]}
    ASSETCATALOG_COMPILER_APPICON_NAME = #{meta[:icon]}
    APP_URL_SCHEME = #{meta[:url_scheme]}
    APP_ENV = #{env[:key]}
  XCCONFIG
  ensure_file_ref(config_group, shared_name)

  { debug: 'Debug', release: 'Release' }.each do |type, base_name|
    config_name = "#{base_name}-#{env[:suffix]}"
    file_name = "#{env[:suffix]}.#{type}.xcconfig"
    pods_config = "../Pods/Target Support Files/Pods-#{target_name}/Pods-#{target_name}.#{config_name.downcase}.xcconfig"
    # `#include?` keeps the project loadable before the first `pod install`.
    write_if_changed(File.join(ios_dir, 'Config', file_name), <<~XCCONFIG)
      // Generated by scripts/native/ios-envs.rb. Do not edit by hand.
      #include? "#{pods_config}"
      #include "#{shared_name}"
    XCCONFIG
    file_ref = ensure_file_ref(config_group, file_name)

    config = target.build_configurations.find { |c| c.name == config_name }
    config.base_configuration_reference = file_ref
    XCCONFIG_OWNED_SETTINGS.each { |setting| config.build_settings.delete(setting) }
    config.build_settings['CODE_SIGN_ENTITLEMENTS'] = entitlements_path
  end
end

# 3. Remove the default Debug/Release configurations, only once every env configuration exists.
env_names = envs.flat_map { |e| ["Debug-#{e[:suffix]}", "Release-#{e[:suffix]}"] }
[project, target].each do |owner|
  list = owner.build_configuration_list
  next unless env_names.all? { |n| list.build_configurations.any? { |c| c.name == n } }

  list.build_configurations.select { |c| %w[Debug Release].include?(c.name) }.each(&:remove_from_project)
  list.default_configuration_name = "Release-#{envs.last[:suffix]}"
end

project.save

# 4. Shared schemes. The pre-action copies the env file to `.env`, which react-native-config reads on iOS.
envs.each do |env|
  scheme = Xcodeproj::XCScheme.new
  scheme.add_build_target(target)
  scheme.set_launch_target(target)

  debug = "Debug-#{env[:suffix]}"
  release = "Release-#{env[:suffix]}"
  scheme.build_action.parallelize_buildables = true
  scheme.build_action.build_implicit_dependencies = true
  scheme.test_action.build_configuration = debug
  scheme.launch_action.build_configuration = debug
  scheme.analyze_action.build_configuration = debug
  scheme.profile_action.build_configuration = release
  scheme.archive_action.build_configuration = release
  scheme.archive_action.reveal_archive_in_organizer = true

  content = Xcodeproj::XCScheme::ShellScriptActionContent.new
  content.title = 'Copy env file'
  content.script_text = %(cp "${PROJECT_DIR}/../.env.#{env[:key]}" "${PROJECT_DIR}/../.env")
  content.shell_to_invoke = '/bin/sh'
  content.buildable_reference = Xcodeproj::XCScheme::BuildableReference.new(target)
  action = Xcodeproj::XCScheme::ExecutionAction.new(nil, :shell_script)
  action.action_content = content
  scheme.build_action.add_pre_action(action)

  scheme.save_as(project_path, "#{target_name}-#{env[:suffix]}", true)
end

# 5. Drop the stock scheme, now replaced by the env ones.
stock_scheme = File.join(project_path, 'xcshareddata', 'xcschemes', "#{target_name}.xcscheme")
FileUtils.rm_f(stock_scheme)

puts "Configured #{envs.map { |e| "#{target_name}-#{e[:suffix]}" }.join(', ')}"
