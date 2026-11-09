/** What a provider needs to know about the build, passed once to `init`. Never personal data. */
export type CrashContext = {
  /** `dev`, `staging` or `prod`: the environment this build belongs to. */
  appEnv: string;
  /** Marketing version (`package.json`). */
  version: string;
  /**
   * The native build number. JavaScript cannot read it without a native module, so the template
   * leaves it out and the SDKs capture it natively. Pass it if your app already has it.
   */
  buildNumber?: string;
  bundleId: string;
};

/** Flat string pairs only: providers accept nothing richer, and nested data invites personal data. */
export type CrashAttributes = Readonly<Record<string, string>>;

/**
 * The one contract between the app and a crash reporting provider. App code calls the facade in
 * `crashReporting.ts`; only a provider adapter (`adapters/<name>.ts`) imports a provider SDK.
 * Collection stays off until `setEnabled(true)`.
 */
export type CrashReporter = {
  /** Starts the SDK with collection OFF. Called once at startup. */
  init: (context: CrashContext) => Promise<void>;
  /**
   * Turns collection on or off for this install (environment, debug build and user opt-out decide).
   * Providers may remember the value across launches, so the facade also calls it with `false`.
   */
  setEnabled: (isEnabled: boolean) => Promise<void>;
  /**
   * Deletes reports captured on the device but not sent yet, so reports from a time the user had
   * opted out are never uploaded after they opt back in.
   */
  discardPending: () => Promise<void>;
  /** Records a handled error (a non-fatal). */
  recordError: (error: Error, context?: CrashAttributes) => void;
  /** Adds a breadcrumb that is attached to the next report. */
  log: (message: string) => void;
  /** Sets or clears the user id shown on reports. Use an opaque id, never an email or a name. */
  setUser: (id: string | null) => void;
  /** Sets attributes shown on every report. */
  setAttributes: (attributes: CrashAttributes) => void;
};

/** A registry entry: how to build a reporter, and whether it can work in this build. */
export type CrashReporterProvider = {
  create: () => CrashReporter;
  /** False when the provider cannot run here (for example Firebase is off); it is then never started. */
  isAvailable: () => boolean;
};
