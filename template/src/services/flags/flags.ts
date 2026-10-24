// Feature flag contract (C15). Resolution order: debug override (non-prod) → AppConfig.flags → defaults.
export const FLAG_DEFAULTS = {
  onboardingEnabled: true,
  itemsCreateEnabled: true,
  biometricLoginEnabled: false,
} as const;

export type FlagKey = keyof typeof FLAG_DEFAULTS;
