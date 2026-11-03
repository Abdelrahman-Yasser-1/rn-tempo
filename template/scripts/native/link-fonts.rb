#!/usr/bin/env ruby
# frozen_string_literal: true

# Links the TTF/OTF files in src/assets/fonts natively. Idempotent: a second run yields no diff.
#
#   iOS:     Copy Bundle Resources entries in the Xcode project + Info.plist UIAppFonts.
#   Android: copies the files to android/app/src/main/assets/fonts/.
#
# File names must equal the PostScript names so one fontFamily string works on both platforms.
# Never edit project.pbxproj by hand. Usage (from template/): yarn fonts:link

require 'fileutils'
require 'xcodeproj'

ROOT = File.expand_path('../..', __dir__)
FONT_DIR = File.join(ROOT, 'src/assets/fonts')
PROJECT = File.join(ROOT, 'ios/TempoApp.xcodeproj')
PLIST = File.join(ROOT, 'ios/TempoApp/Info.plist')
ANDROID_DIR = File.join(ROOT, 'android/app/src/main/assets/fonts')
TARGET = 'TempoApp'

fonts = Dir.glob(File.join(FONT_DIR, '*.{ttf,otf}')).map { |f| File.basename(f) }.sort
abort "No fonts found in #{FONT_DIR}" if fonts.empty?

# Android
FileUtils.mkdir_p(ANDROID_DIR)
fonts.each do |name|
  src = File.join(FONT_DIR, name)
  dest = File.join(ANDROID_DIR, name)
  FileUtils.cp(src, dest) unless File.exist?(dest) && FileUtils.compare_file(src, dest)
end
Dir.children(ANDROID_DIR).reject { |n| fonts.include?(n) }.each { |n| FileUtils.rm_f(File.join(ANDROID_DIR, n)) }

# iOS project
project = Xcodeproj::Project.open(PROJECT)
target = project.targets.find { |t| t.name == TARGET } || abort("Target #{TARGET} not found")
group = project.main_group.find_subpath('Fonts', true)
group.set_source_tree('SOURCE_ROOT')
group.set_path('src/assets/fonts')

fonts.each do |name|
  ref = group.files.find { |f| f.path == name } || group.new_file(name)
  next if target.resources_build_phase.files_references.include?(ref)

  target.resources_build_phase.add_file_reference(ref, true)
end
project.save

# Info.plist UIAppFonts (plist is edited textually to keep the rest of the file byte-identical)
plist = File.read(PLIST)
entries = fonts.map { |n| "\t\t<string>#{n}</string>\n" }.join
block = "\t<key>UIAppFonts</key>\n\t<array>\n#{entries}\t</array>\n"
updated =
  if plist.include?('<key>UIAppFonts</key>')
    plist.sub(%r{\t<key>UIAppFonts</key>\n\t<array>\n.*?\t</array>\n}m) { block }
  else
    plist.sub(%r{(\t<key>UILaunchStoryboardName</key>)}) { "#{block}#{$1}" }
  end
abort 'Could not place UIAppFonts in Info.plist' if updated == plist && !plist.include?('UIAppFonts')
File.write(PLIST, updated) unless updated == plist

puts "Linked #{fonts.size} fonts"
