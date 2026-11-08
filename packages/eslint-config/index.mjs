import eslintConfigPrettier from "eslint-config-prettier/flat";

import { boundariesConfig } from "./configs/boundaries.mjs";
import { baseConfig } from "./configs/base.mjs";
import { qualityConfig } from "./configs/quality.mjs";
import { reactConfig } from "./configs/react.mjs";
import { reactNativeConfig } from "./configs/react-native.mjs";
import {
  dependenciesConfig,
  DEPENDENCY_POLICY,
} from "./configs/dependencies.mjs";
import { screenLogicConfig } from "./configs/restrictions.mjs";
import { structureConfig } from "./configs/structure.mjs";
import { syntaxConfig } from "./configs/syntax.mjs";
import { testsConfig } from "./configs/tests.mjs";
import { findPolicyEntry } from "./plugin/dependency-owner.mjs";
import { rnTempoPlugin } from "./plugin/index.mjs";

export { DEPENDENCY_POLICY, findPolicyEntry, rnTempoPlugin };

/**
 * Builds the RN-TEMPO flat config.
 * @param {{ root: string, structure?: boolean, dependencies?: Record<string, object> }} options `root` is the project folder (usually `import.meta.dirname`); `dependencies` adds or overrides entries of `DEPENDENCY_POLICY`.
 */
export function createConfig({ root, structure = false, dependencies = {} }) {
  return [
    ...baseConfig(root),
    ...reactConfig(),
    ...reactNativeConfig(),
    ...qualityConfig(root),
    ...syntaxConfig(),
    ...dependenciesConfig(dependencies),
    ...screenLogicConfig(),
    ...testsConfig(),
    ...(structure ? [...boundariesConfig(root), ...structureConfig(root)] : []),
    eslintConfigPrettier,
    {
      // eslint-config-prettier switches `curly` off; braces are always required here.
      name: "rn-tempo/base/curly",
      rules: { curly: ["error", "all"] },
    },
  ];
}
