# Firebase config files

One Firebase project per environment is the recommendation. Each environment keeps its own files here:

```
firebase/
  dev/       google-services.json  GoogleService-Info.plist   (may be committed)
  staging/   google-services.json  GoogleService-Info.plist   (gitignored: CI writes them from secrets)
  prod/      google-services.json  GoogleService-Info.plist   (gitignored: CI writes them from secrets)
```

This template ships no real files. Add yours from the Firebase console (Project settings, Your apps).

## How a build uses them

- A build copies **only its own environment's** files, and only when `.env.<env>` has `FIREBASE_ENABLED=true`.
- Android: the Gradle task `syncFirebaseConfig<Flavor>` copies `firebase/<env>/google-services.json` to `android/app/src/<env>/google-services.json` (gitignored). It deletes that copy when the flag is not `true`.
- iOS: the **Copy Firebase config** build phase copies `firebase/<env>/GoogleService-Info.plist` into the app bundle. It removes any copy when the flag is not `true`.
- Flag `true` and the file missing: the build fails with a message that names the file.
- Flag `false` (the default): the app builds and runs, and nothing initialises Firebase.

## Rules

- Staging and prod files are not committed (`.gitignore`). A custom environment, for example `qa`, needs its own `firebase/qa/` line in `.gitignore`.
- Never put another environment's file in a folder to "make a build work".
- In CI, write the files from secrets before the build, for example `echo "$FIREBASE_ANDROID_STAGING" | base64 -d > firebase/staging/google-services.json`.

Full guide: the docs page "Firebase per environment".
