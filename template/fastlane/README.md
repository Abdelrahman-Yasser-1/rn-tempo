# Fastlane

Lanes for building and shipping the app. Run them from the project root (`bundle install` first).

| Lane                                                              | What it does                                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `fastlane android build env:<dev\|staging\|prod> type:<apk\|aab>` | Gradle `assemble<Env>Release` (apk, default) or `bundle<Env>Release` (aab, default for prod)                                         |
| `fastlane android beta env:<env>`                                 | Builds an APK and uploads it to Firebase App Distribution                                                                            |
| `fastlane android release`                                        | Builds the prod AAB and uploads it to the Play **internal** track                                                                    |
| `fastlane ios build env:<env>`                                    | match (readonly) + gym, scheme `TempoApp-<Env>`, configuration `Release-<Env>`. dev/staging use ad-hoc profiles, prod uses app-store |
| `fastlane ios beta env:<env>`                                     | dev/staging go to Firebase App Distribution, prod goes to TestFlight                                                                 |
| `fastlane ios release`                                            | Builds prod and uploads to TestFlight, waiting for processing                                                                        |

Environments follow the matrix in `.tempo.json`: bundle IDs `com.rntempo.app.dev`, `com.rntempo.app.staging`, `com.rntempo.app`.

## Versions

- Version name: `version` in `package.json` (Android `-PtempoVersionName`, iOS `MARKETING_VERSION`).
- Build number: `GITHUB_RUN_NUMBER` in CI, or minutes since the epoch locally (Android `-PtempoVersionCode`, iOS `CURRENT_PROJECT_VERSION`). Do not upload local builds to a store, a local number is larger than any CI run number.

## Secrets

Everything is read from environment variables. In GitHub Actions they are repository (or environment) secrets.

| Secret                                                                                           | Used by             | Notes                                                                      |
| ------------------------------------------------------------------------------------------------ | ------------------- | -------------------------------------------------------------------------- |
| `ENV_FILE_STAGING`                                                                               | build workflow      | Full contents of `.env.staging`, written before native builds              |
| `ENV_FILE_PROD`                                                                                  | build workflow      | Full contents of `.env.prod`                                               |
| `MATCH_GIT_URL`                                                                                  | iOS                 | Git URL of the encrypted signing repo                                      |
| `MATCH_PASSWORD`                                                                                 | iOS                 | Passphrase of the signing repo                                             |
| `APP_STORE_CONNECT_API_KEY_ID`                                                                   | iOS TestFlight      | App Store Connect API key ID                                               |
| `APP_STORE_CONNECT_API_KEY_ISSUER_ID`                                                            | iOS TestFlight      | Issuer ID                                                                  |
| `APP_STORE_CONNECT_API_KEY_KEY_CONTENT`                                                          | iOS TestFlight      | Contents of the `.p8` key, raw or base64                                   |
| `FIREBASE_APP_ID_DEV_ANDROID`, `FIREBASE_APP_ID_STAGING_ANDROID`, `FIREBASE_APP_ID_PROD_ANDROID` | Android beta        | Firebase app IDs                                                           |
| `FIREBASE_APP_ID_DEV_IOS`, `FIREBASE_APP_ID_STAGING_IOS`, `FIREBASE_APP_ID_PROD_IOS`             | iOS beta            | Firebase app IDs                                                           |
| `FIREBASE_TOKEN`                                                                                 | beta lanes          | CLI token. Used only when `FIREBASE_SERVICE_ACCOUNT_JSON` is absent        |
| `PLAY_JSON_KEY`                                                                                  | `android release`   | Contents of the Google Play service account JSON                           |
| `TEMPO_UPLOAD_STORE_PASSWORD`, `TEMPO_UPLOAD_KEY_ALIAS`, `TEMPO_UPLOAD_KEY_PASSWORD`             | prod Android builds | Upload key credentials                                                     |
| `TEMPO_UPLOAD_STORE_FILE`                                                                        | prod Android builds | Path of the upload keystore. In CI use `TEMPO_UPLOAD_STORE_BASE64` instead |

Additions beyond the original list:

| Secret                          | Used by             | Notes                                                                                                |
| ------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `APPLE_TEAM_ID`                 | iOS                 | Apple developer team ID                                                                              |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | beta lanes          | Service account JSON (preferred over `FIREBASE_TOKEN`)                                               |
| `TEMPO_UPLOAD_STORE_BASE64`     | prod Android builds | Base64 of the upload keystore. The lane decodes it to a temp file and sets `TEMPO_UPLOAD_STORE_FILE` |

Optional variables: `FIREBASE_TESTER_GROUPS` (comma-separated group aliases), `RELEASE_NOTES`, `PLAY_RELEASE_STATUS` (default `completed`; use `draft` for an app that was never published).

Prod Android builds fail fast when the upload key is incomplete (the Gradle guard in `android/app/build.gradle` enforces it as well). The key is passed to Gradle through the process environment, never on the command line.

## Notes

- The iOS lanes edit `ios/TempoApp.xcodeproj` (manual signing for the `Release-<Env>` configuration). Revert with `git checkout ios/TempoApp.xcodeproj` after a local run.
- Lanes never delete `ios/build`: it holds React Native codegen output written by `pod install`.
- Run `yarn pods` (or `cd ios && bundle exec pod install`) before iOS lanes.
- Firebase iOS distribution needs ad-hoc profiles, so register tester devices and refresh the match `adhoc` profiles.
- `Pluginfile` holds the Firebase App Distribution plugin; the Gemfile loads it.
