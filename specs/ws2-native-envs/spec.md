---
status: approved
owner: implementer (cheap model), reviewed by strong model
created: 2026-10-24
plan: ../PLAN.md
---

# WS2 — Native & environments (Wave 1)

## Problem
Part of building RN-TEMPO v2. The full rationale and contracts are in [`specs/PLAN.md`](../PLAN.md): read Part A (rules), Part C (contracts) and the **Amendments** section at the end before starting.

## Scope
**Owns (only touch these paths):** `template/android/**`, `template/ios/**`, `template/scripts/native/**`, `template/assets/bootsplash/**`, `template/src/assets/icons-source/**`, `.env.*`, and the run/build scripts in `template/package.json` (`scripts` section only).

## Acceptance criteria
- **AC-1** the 3 debug variants install **side by side** on one emulator with the 3 names, and `ENV.APP_ENV` shows the right value. Use a temporary `Text`, then remove it. Paste a screenshot of the launcher.
- **AC-2** 
- **AC-3** each launcher shows the correct icon, the ribbon is visible on dev and staging, and running the script twice produces byte-identical output (deterministic).
- **AC-4** the splash shows on cold start on both platforms and hides after bootstrap.
- **AC-5** `./gradlew assembleProdRelease` builds and the APK launches (debug keystore fallback); the iOS Release-Prod simulator build works.

## Out of scope
Anything owned by another workstream. Put requests in the PR under "Out-of-scope requests".

## Open questions
None. If anything is ambiguous, STOP and ask the integrator.

## Plan section (verbatim copy — `PLAN.md` wins if they ever differ)

### WS2 — Native & environments (Wave 1)
**Owns:** `template/android/**`, `template/ios/**`, `template/scripts/native/**`, `template/assets/bootsplash/**`, `template/src/assets/icons-source/**`, `.env.*`, and the run/build scripts in `template/package.json` (`scripts` section only).

**2.1 Android flavors**
- **`android/app/build.gradle`:**
  ```gradle
  project.ext.envConfigFiles = [
    devdebug: ".env.dev", devrelease: ".env.dev",
    stagingdebug: ".env.staging", stagingrelease: ".env.staging",
    proddebug: ".env.prod", prodrelease: ".env.prod",
  ]
  apply from: project(':react-native-config').projectDir.getPath() + "/dotenv.gradle"
  ```
  Then:
  - Set `react { debuggableVariants = ["devDebug", "stagingDebug", "prodDebug"] }`.
  - Add `flavorDimensions "environment"`.
  - Add `productFlavors` per §B2, each with `applicationIdSuffix`, `resValue "string", "app_name", "<Display>"`, and `manifestPlaceholders = [deepLinkScheme: "<scheme>", deepLinkHost: "example.invalid"]`.
  - Set `buildConfigField "String", "APP_ENV", "\"dev\""` etc.
- **`AndroidManifest.xml`:**
  - `android:label="@string/app_name"`.
  - A VIEW intent-filter for `${deepLinkScheme}`.
  - An `https` + `${deepLinkHost}` intent-filter with `android:autoVerify="true"`, wrapped in a comment that explains how to set the real host.
  - Remove `app_name` from `res/values/strings.xml`.
- **`react-native.config.js`:** nothing needed. Scripts use `--mode`.
- **Scripts:**
  - `"android:dev": "react-native run-android --mode devDebug --appIdSuffix dev"`
  - Likewise for staging and prod (no suffix flag for prod).
  - Release: `"android:dev:release": "cd android && ./gradlew assembleDevRelease"`, and the matching bundle tasks `bundleProdRelease`.
  - `"start:dev": "react-native start"` (the env is chosen natively, so the start variants are aliases for clarity).
- **Done when:** the 3 debug variants install **side by side** on one emulator with the 3 names, and `ENV.APP_ENV` shows the right value. Use a temporary `Text`, then remove it. Paste a screenshot of the launcher.
- **Commits:**
  - `feat(android): add environment product flavors`
  - `feat(android): add deep link intent filters`
  - `build(template): add android env scripts`

**2.2 iOS configurations & schemes — via a script, never manual pbxproj edits**
- **Files:** `scripts/native/ios-envs.rb`, using the `xcodeproj` gem that ships with CocoaPods (add `gem 'xcodeproj'` to the Gemfile if it isn't resolvable). The script is idempotent. Given `--project ios/TempoApp.xcodeproj --target TempoApp --envs dev:Dev,staging:Staging,prod:Prod`, it:
  1. Creates the build configurations `Debug-<Env>`, based on `Debug`, and `Release-<Env>`, based on `Release`, at both project and target level.
  2. Sets each configuration's `baseConfigurationReference` to `ios/Config/<Env>.xcconfig`. Each xcconfig `#include`s the Pods xcconfig for that configuration, `Pods/Target Support Files/Pods-TempoApp/Pods-TempoApp.<config lowercased>.xcconfig`; the script writes it with `#include?`.
  3. Creates shared schemes `TempoApp-<Env>`: build/run/test use `Debug-<Env>`, archive/profile use `Release-<Env>`. Each has a pre-action on Build: `cp "${PROJECT_DIR}/../.env.<env>" "${PROJECT_DIR}/../.env"` (react-native-config reads `.env` on iOS); add `.env` to `.gitignore`.
  4. Deletes the default `TempoApp` scheme and the plain `Debug`/`Release` configurations, only after the env ones exist.
- **`ios/Config/<Env>.xcconfig`:**
  ```
  #include? "../Pods/Target Support Files/Pods-TempoApp/Pods-TempoApp.debug-dev.xcconfig"   // per config — see note
  PRODUCT_BUNDLE_IDENTIFIER = com.rntempo.app.dev
  APP_DISPLAY_NAME = Tempo Dev
  ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon-Dev
  APP_URL_SCHEME = tempo-dev
  APP_ENV = dev
  ```
  **Note:** the Pods include differs between Debug and Release. So create **two** files per env, `Dev.debug.xcconfig` and `Dev.release.xcconfig`, each `#include "Dev.shared.xcconfig"` plus its own Pods include. File names: `Config/<Env>.shared.xcconfig`, `Config/<Env>.debug.xcconfig`, `Config/<Env>.release.xcconfig`.
- **`Info.plist`:**
  - `CFBundleDisplayName = $(APP_DISPLAY_NAME)`.
  - `CFBundleURLTypes` with `$(APP_URL_SCHEME)`.
  - `APP_ENV = $(APP_ENV)` (informational).
- **`Podfile`:**
  ```ruby
  project 'TempoApp', 'Debug-Dev' => :debug, 'Release-Dev' => :release,
                      'Debug-Staging' => :debug, 'Release-Staging' => :release,
                      'Debug-Prod' => :debug, 'Release-Prod' => :release
  ```
- **Scripts:**
  - `"ios:dev": "react-native run-ios --scheme TempoApp-Dev --mode Debug-Dev"`, and likewise for staging and prod.
  - `"pods": "cd ios && bundle exec pod install"`.
  - `"ios:envs": "ruby scripts/native/ios-envs.rb --project ios/TempoApp.xcodeproj --target TempoApp --envs dev:Dev,staging:Staging,prod:Prod"`.
- **Universal links:** documented only. Add a `TempoApp.entitlements` with an empty `com.apple.developer.associated-domains` array, commented in the docs. **Do not** add domains, because that breaks unsigned builds.
- **Done when:**
  - The 3 schemes install side by side on one simulator with the correct names.
  - `xcodebuild -workspace ios/TempoApp.xcworkspace -scheme TempoApp-Prod -configuration Release-Prod -sdk iphonesimulator build` succeeds.
  - Re-running `yarn ios:envs` produces no diff.
- **Commits:**
  - `feat(ios): add environment configuration script`
  - `feat(ios): add per-environment xcconfigs and schemes`
  - `build(ios): map pod configurations`
  - `build(template): add ios env scripts`

**2.3 Per-env app icons**
- **Files:**
  - `scripts/native/icons.mjs`, using `sharp` (add it as a template devDependency, exact, in its own commit).
  - Source images: `src/assets/icons-source/app-icon.png` (1024×1024, a placeholder "T" logo committed as PNG) and `app-icon-foreground.png` (adaptive icon foreground, 432×432 with a safe zone).
- **What it generates:**
  - **Android**, under `android/app/src/<flavor>/res/`: `mipmap-{mdpi 48, hdpi 72, xhdpi 96, xxhdpi 144, xxxhdpi 192}/ic_launcher.png` and `ic_launcher_round.png` (circle mask), plus `mipmap-anydpi-v26/ic_launcher.xml` (adaptive icon with foreground and a background color `#FFFFFF` in `values/ic_launcher_background.xml`).
  - **iOS:** `ios/TempoApp/Images.xcassets/AppIcon[-Dev|-Staging].appiconset/` with a single 1024 universal icon and a `Contents.json` using the modern single-size format.
- **Badges:** a bottom ribbon with the §B2 text and color, white bold text at 18% of the icon height. Prod has no badge.
- **Script:** `"icons": "node scripts/native/icons.mjs"`.
- **Done when:** each launcher shows the correct icon, the ribbon is visible on dev and staging, and running the script twice produces byte-identical output (deterministic).
- **Commits:**
  - `build(deps): add sharp`
  - `feat(native): add per-environment icon generator`
  - `chore(native): generate app icons`

**2.4 Splash** (react-native-bootsplash)
- **Steps:**
  - Run `npx react-native-bootsplash generate src/assets/icons-source/splash-logo.png --platforms=android,ios --background=FFFFFF --logo-width=120 --assets-output=assets/bootsplash --flavor=main`. Check the flag names via context7.
  - Wire `MainActivity.kt` (`RNBootSplash.init`) and `AppDelegate.swift` per the docs.
  - `BootSplash.hide({ fade: true })` is called by WS3 bootstrap. Put a TODO in `App.tsx` that WS3 removes.
- **Done when:** the splash shows on cold start on both platforms and hides after bootstrap.
- **Commit:** `feat(native): add boot splash screen`

**2.5 Release hardening**
- **Android:**
  - `enableProguardInReleaseBuilds = true`, `shrinkResources true`.
  - `proguard-rules.pro`: keep rules for react-native-config (`-keep class com.rntempo.app.BuildConfig { *; }`), and for any libs whose docs require them (Reanimated, MMKV/Nitro, Keychain, SVG). Verify each lib's docs.
  - Release signing reads `TEMPO_UPLOAD_STORE_FILE`, `TEMPO_UPLOAD_STORE_PASSWORD`, `TEMPO_UPLOAD_KEY_ALIAS` and `TEMPO_UPLOAD_KEY_PASSWORD` from `~/.gradle/gradle.properties` or the environment. When they're absent, fall back to the debug keystore for local release testing only, with a warning.
- **iOS:** `PrivacyInfo.xcprivacy` gets `NSPrivacyAccessedAPITypes` entries for UserDefaults (CA92.1), FileTimestamp (C617.1) and SystemBootTime (35F9.1), as RN requires. Check the current RN docs.
- **Done when:** `./gradlew assembleProdRelease` builds and the APK launches (debug keystore fallback); the iOS Release-Prod simulator build works.
- **Commits:**
  - `build(android): enable r8 and release signing config`
  - `chore(ios): update privacy manifest`

**2.6 Native bits for other WS**
- **Keychain:** no native config needed. Verify.
- **Pinning:** no native config needed. Verify.
- **jail-monkey:** nothing to configure.
- **Fonts:** create the `src/assets/fonts/` folder + `react-native.config.js` `assets: ['./src/assets/fonts']`. No custom font ships; system fonts are used.
- **Commit:** `chore(native): prepare font asset linking`

---
