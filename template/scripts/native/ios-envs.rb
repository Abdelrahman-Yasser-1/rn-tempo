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
require 'json'
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
XCCONFIG_OWNED_SETTINGS = %w[PRODUCT_BUNDLE_IDENTIFIER ASSETCATALOG_COMPILER_APPICON_NAME MARKETING_VERSION].freeze

options = { bundle_id: BASE_BUNDLE_ID }
OptionParser.new do |o|
  o.on('--project PATH', 'Path to the .xcodeproj') { |v| options[:project] = v }
  o.on('--target NAME', 'App target name') { |v| options[:target] = v }
  o.on('--envs LIST', 'Comma separated key:Suffix pairs, e.g. dev:Dev,staging:Staging,prod:Prod') { |v| options[:envs] = v }
  o.on('--remove LIST', 'Comma separated key:Suffix pairs to remove (configurations, xcconfigs, scheme), e.g. qa:Qa') { |v| options[:remove] = v }
  o.on('--meta JSON', 'Per-env overrides: {"qa":{"display_name":"..","url_scheme":"..","bundle_suffix":".qa"}}') do |v|
    options[:meta] = JSON.parse(v)
  end
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

def meta_for(env, bundle_id, overrides = {})
  base = ENV_META.fetch(env[:key]) do
    { display_name: "Tempo #{env[:suffix]}", url_scheme: "tempo-#{env[:key]}",
      bundle_suffix: ".#{env[:key]}", icon: "AppIcon-#{env[:suffix]}" }
  end
  custom = (overrides[env[:key]] || {}).transform_keys(&:to_sym)
  base = base.merge(custom)
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

# The marketing version lives in one file that every env xcconfig includes. release-please bumps the
# annotated block (see release-please-config.json `extra-files`), so it is only created when missing
# and never rewritten: re-running this script after a release must not produce a diff.
version_path = File.join(ios_dir, 'Config', 'Version.xcconfig')
unless File.exist?(version_path)
  package_version = JSON.parse(File.read(File.join(ios_dir, '..', 'package.json'))).fetch('version')
  write_if_changed(version_path, <<~XCCONFIG)
    // The marketing version (CFBundleShortVersionString). Kept in step with package.json by release-please.
    // x-release-please-start-version
    MARKETING_VERSION = #{package_version}
    // x-release-please-end
  XCCONFIG
end
ensure_file_ref(config_group, 'Version.xcconfig')

envs.each do |env|
  meta = meta_for(env, options[:bundle_id], options[:meta] || {})
  shared_name = "#{env[:suffix]}.shared.xcconfig"
  write_if_changed(File.join(ios_dir, 'Config', shared_name), <<~XCCONFIG)
    // Generated by scripts/native/ios-envs.rb. Do not edit by hand.
    #include "Version.xcconfig"
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

# 3b. Build phases that need the environment (idempotent: found by name, script rewritten each run).
def ensure_script_phase(target, name, script)
  phase = target.shell_script_build_phases.find { |p| p.name == name }
  phase ||= target.new_shell_script_build_phase(name)
  phase.shell_script = script
  phase.shell_path = '/bin/sh'
  phase.always_out_of_date = '1'
  phase.show_env_vars_in_log = '0'
end

# Firebase config: one project per environment. Copies firebase/<env>/GoogleService-Info.plist into the app
# only when .env.<env> has FIREBASE_ENABLED=true, and removes any copy otherwise, so no build ever bundles
# another environment's file. Without the firebase-core module there is no such file and nothing is
# enabled, so the phase does nothing.
ensure_script_phase(target, 'Copy Firebase config', <<~'SCRIPT')
  set -e
  ENV_FILE="${SRCROOT}/../.env.${APP_ENV}"
  SOURCE="${SRCROOT}/../firebase/${APP_ENV}/GoogleService-Info.plist"
  DEST="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/GoogleService-Info.plist"
  rm -f "${DEST}"
  ENABLED=""
  if [ -f "${ENV_FILE}" ]; then
    ENABLED=$(grep -E '^[[:space:]]*FIREBASE_ENABLED[[:space:]]*=' "${ENV_FILE}" | tail -1 | cut -d= -f2- | tr -d " \"'\r" || true)
  fi
  if [ "${ENABLED}" != "true" ]; then
    echo "firebase-core: ${APP_ENV}: FIREBASE_ENABLED is not true, building without Firebase."
    exit 0
  fi
  if [ ! -f "${SOURCE}" ]; then
    echo "error: .env.${APP_ENV} has FIREBASE_ENABLED=true but firebase/${APP_ENV}/GoogleService-Info.plist is missing. See firebase/README.md or set FIREBASE_ENABLED=false."
    exit 1
  fi
  cp "${SOURCE}" "${DEST}"
  echo "firebase-core: ${APP_ENV}: bundled firebase/${APP_ENV}/GoogleService-Info.plist."
SCRIPT

# Crashlytics dSYM upload (the crashlytics module). Runs for Release configurations only, and only when the
# built app bundles a GoogleService-Info.plist (so only for environments with FIREBASE_ENABLED=true; the phase
# above removes the file otherwise). Firebase 13 comes through Swift Package Manager, so upload-symbols lives
# in the SourcePackages checkout of this build's DerivedData. A failed upload warns and never fails the build.
# Fastlane sets TEMPO_SKIP_DSYM_PHASE=1 because its lane uploads the dSYMs itself. Without the module there is
# no upload-symbols binary, and the phase says so and does nothing.
ensure_script_phase(target, 'Upload Crashlytics dSYMs', <<~'SCRIPT')
  case "${CONFIGURATION}" in
    Debug*) echo "crashlytics: ${CONFIGURATION}: debug build, not uploading dSYMs."; exit 0 ;;
  esac
  if [ "${TEMPO_SKIP_DSYM_PHASE}" = "1" ]; then
    echo "crashlytics: dSYMs are uploaded by the build lane, skipping."
    exit 0
  fi
  PLIST="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/GoogleService-Info.plist"
  if [ ! -f "${PLIST}" ]; then
    echo "crashlytics: ${APP_ENV}: no GoogleService-Info.plist in the app, not uploading dSYMs."
    exit 0
  fi
  UPLOAD="${BUILD_DIR%Build/*}SourcePackages/checkouts/firebase-ios-sdk/Crashlytics/upload-symbols"
  if [ ! -f "${UPLOAD}" ]; then
    echo "crashlytics: upload-symbols not found at ${UPLOAD}, not uploading dSYMs."
    exit 0
  fi
  DSYM="${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}"
  if [ ! -d "${DSYM}" ]; then
    echo "warning: crashlytics: no dSYM at ${DSYM} (DEBUG_INFORMATION_FORMAT must be dwarf-with-dsym for release builds)."
    exit 0
  fi
  chmod +x "${UPLOAD}"
  if ! perl -e 'alarm shift; exec @ARGV' 300 "${UPLOAD}" -gsp "${PLIST}" -p ios "${DSYM}"; then
    echo "warning: crashlytics: dSYM upload failed or timed out; continuing. Upload them later with fastlane or the Firebase console."
  fi
SCRIPT

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
