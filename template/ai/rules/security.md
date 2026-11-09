---
description: Env access through ENV, no secrets in code or logs, secure token storage, SSL pinning and device integrity.
globs: src/services/**,src/config/**,.env*
---

# Security

No secrets in the repo, no tokens outside the Keychain, no direct env access.

- **Env:** import `ENV` from `@config/env` (zod-validated at startup, fails fast). Importing `react-native-config` anywhere else is a lint error. A new variable goes in `src/config/parseEnv.ts` (schema; `env.ts` calls it and throws `EnvError` when the config is bad) and `.env.example`, plus the `.env.*` files.
- `.env.dev` is committed and must **never** contain secrets. `.env.staging` and `.env.prod` are gitignored; CI writes them from the `ENV_FILE_STAGING` and `ENV_FILE_PROD` secrets. The pre-commit `env-guard` and `gitleaks` block secrets; never bypass hooks.
- `eslint-plugin-no-secrets` flags high-entropy strings. Do not hard-code keys, tokens, passwords or private URLs; do not paste them into prompts (prompt logs are redacted, but do not rely on it).
- **Tokens:** only in `@services/secure-storage` (`tokenStore`: Keychain service `<bundleId>.auth-tokens`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, in-memory cache). Never in Zustand, MMKV, logs or analytics. Only `src/services/secure-storage/**` (and `storage/encryptionKey.ts`) may import `react-native-keychain`.
- **Firebase config** is per environment in `firebase/<env>/`. `firebase/staging/` and `firebase/prod/` are gitignored (CI writes them from secrets); never commit them and never copy one environment's file into another. A build copies only its own files, and only when `.env.<env>` has `FIREBASE_ENABLED=true`. Check `isFirebaseEnabled()` from `@services/firebase/firebase` before calling any Firebase SDK.
- **Crash reporting:** call only the facade in `@services/crash-reporting/crashReporting`; a crash SDK is imported only by its adapter in `src/services/crash-reporting/adapters/`. Reports are off in debug builds, when `CRASH_REPORTING_ENABLED` is false and when the user opted out. Never send tokens, emails, names or other PII: `setCrashUser` takes an opaque id and attributes are flat strings.
- **Storage:** MMKV instance `app-storage` is encrypted; its key is 32 random bytes held in the Keychain (`<bundleId>.mmkv-key`). Use `@services/storage`; never AsyncStorage.
- **SSL pinning** (`ssl-pinning` module): SPKI pins from `ENV.SSL_PINS` (at least 2 when enabled). It **fails closed in prod**: pinning disabled or failing blocks startup with the security error screen. Do not weaken or bypass the request gate.
- **Device integrity** (`device-integrity` module): jail-monkey checks run when `ENV.DEVICE_INTEGRITY_ENABLED && !__DEV__`; a compromised device sees a blocking screen in prod.
- Debug-only features (`DebugMenu`, `app.api-base-url-override`) must be unreachable in prod builds (`isProd`).
- Log through `@services/logger`, never `console` (`no-console` is an error). Do not log tokens, passwords, OTP codes or PII.
- Deep links are untrusted input: parse params with Zod before use.
- Android prod release builds need the `TEMPO_UPLOAD_*` signing properties; never commit keystores.

```ts
// ✅
import { ENV } from '@config/env';
const baseUrl = ENV.API_BASE_URL;

// ❌
import Config from 'react-native-config';
const apiKey = 'sk_live_51H...'; // hard-coded secret
console.log('token', accessToken);
```
