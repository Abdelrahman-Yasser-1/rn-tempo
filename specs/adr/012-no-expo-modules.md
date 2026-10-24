# ADR-012: Pure React Native CLI libraries, no Expo modules

- **Status:** accepted · 2026-10-24

## Decision
Don't install `expo-modules-core`. Use community libraries instead: MMKV, keychain, bootsplash, fast-image.

## Why
- Fewer native layers to keep in sync on each RN upgrade.
- Teams can still adopt Expo modules per project (documented as a recipe).
