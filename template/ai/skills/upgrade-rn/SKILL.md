---
name: upgrade-rn
description: Upgrade React Native or the template safely using the upgrade helper diff and tempo upgrade output. Use when the user asks to bump React Native or pull in a newer template version.
---

# upgrade-rn

1. Record current versions: `react-native` in `package.json`, `templateVersion` in `.tempo.json`.
2. Template upgrade: run `yarn tempo upgrade` (when the CLI is installed). It writes `.tempo/upgrade-<from>-<to>.patch`; review it, then apply with `--apply` (`git apply --3way`) and resolve conflicts by hand.
3. React Native upgrade: get the diff for `<from>` to `<to>` from the React Native Upgrade Helper (https://react-native-community.github.io/upgrade-helper/) and apply it to `ios/` and `android/` and config files. Check the release notes for breaking changes.
4. Dependency pins stay exact (no `^` / `~`). Dependency changes go in their own `build(deps)` commit; native regeneration (`yarn pods`, lockfiles) in its own `chore(...)` commit.
5. Verify the library APIs you touch with context7 for the pinned versions; never from memory.
6. Run `yarn install`, `yarn pods`, `yarn verify`, then build dev on iOS and Android, and run the Maestro flows if present.
7. Never run `rm -rf ios/build`: it holds codegen output. If removed, run `yarn pods` before building.
8. Commit in small steps. Summarise risks in the PR.
