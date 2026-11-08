import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

import { createConfig, DEPENDENCY_POLICY } from "../index.mjs";
import {
  DISCOURAGED_SYNTAX_ENTRIES,
  RESTRICTED_SYNTAX_ENTRIES,
} from "../configs/syntax.mjs";

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

/** Lints every file of a fixture project and returns { 'src/...': ['rule/id', ...] }. */
async function lintFixture(name) {
  const cwd = path.join(fixtures, name);
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: createConfig({ root: cwd, structure: true }),
  });
  const results = await eslint.lintFiles(["src/**"]);
  return Object.fromEntries(
    results.map((result) => [
      path.relative(cwd, result.filePath),
      result.messages.map((message) => message.ruleId),
    ]),
  );
}

/** Lints one file of a fixture project and returns its message texts. */
async function lintMessages(name, file) {
  const cwd = path.join(fixtures, name);
  const eslint = new ESLint({
    cwd,
    overrideConfigFile: true,
    overrideConfig: createConfig({ root: cwd, structure: true }),
  });
  const [result] = await eslint.lintFiles([file]);
  return result.messages.map((message) => message.message);
}

describe("eslint-config fixtures", () => {
  let valid;
  let invalid;

  beforeAll(async () => {
    [valid, invalid] = await Promise.all([
      lintFixture("valid"),
      lintFixture("invalid"),
    ]);
  }, 120_000);

  it("accepts the valid fixture without a single message", () => {
    expect(Object.keys(valid).length).toBeGreaterThan(5);
    const withMessages = Object.entries(valid).filter(
      ([, rules]) => rules.length > 0,
    );
    expect(withMessages).toEqual([]);
  });

  const cases = [
    [
      "shared importing a feature",
      "src/shared/utils/importsFeature.ts",
      "boundaries/dependencies",
    ],
    [
      "a deep import into another feature",
      "src/features/auth/utils/deepImport.ts",
      "boundaries/dependencies",
    ],
    [
      "services importing shared-ui",
      "src/services/http/usesUi.ts",
      "boundaries/dependencies",
    ],
    [
      "raw Text",
      "src/features/home/components/RawText/RawText.tsx",
      "rn-tempo/restricted-syntax",
    ],
    [
      "react-native-config outside env",
      "src/services/http/readsConfig.ts",
      "rn-tempo/dependency-owner",
    ],
    [
      "axios outside services/http",
      "src/services/storage/usesAxios.ts",
      "rn-tempo/dependency-owner",
    ],
    [
      "react-native StyleSheet in a shared component",
      "src/shared/components/RnSheet/RnSheet.tsx",
      "rn-tempo/restricted-syntax",
    ],
    [
      "a service folder nested two levels deep",
      "src/services/security/pinning/deep/tooDeep.ts",
      "project-structure/folder-structure",
    ],
    ["an enum", "src/shared/types/status.ts", "rn-tempo/restricted-syntax"],
    ["console", "src/shared/utils/logs.ts", "no-console"],
    [
      "a missing story file",
      "src/shared/components/NoStory/NoStory.tsx",
      "project-structure/folder-structure",
    ],
    [
      "an unknown folder",
      "src/misc/thing.ts",
      "project-structure/folder-structure",
    ],
    [
      "a non-test file importing test-utils",
      "src/features/home/utils/usesTestUtils.ts",
      "boundaries/dependencies",
    ],
    [
      "a default export",
      "src/shared/utils/defaultExport.ts",
      "import-x/no-default-export",
    ],
    [
      "a literal string in JSX",
      "src/features/home/components/Banner/Banner.tsx",
      "i18next/no-literal-string",
    ],
    ["an import cycle", "src/shared/utils/cycleA.ts", "import-x/no-cycle"],
    [
      "a boolean without prefix",
      "src/shared/utils/flag.ts",
      "@typescript-eslint/naming-convention",
    ],
    [
      "a missing JSDoc on a service export",
      "src/services/http/noDocs.ts",
      "jsdoc/require-jsdoc",
    ],
    [
      "an inline style",
      "src/features/home/components/Inline/Inline.tsx",
      "react-native/no-inline-styles",
    ],
    [
      "a high-entropy secret",
      "src/shared/utils/secret.ts",
      "no-secrets/no-secrets",
    ],
    [
      "a stray hook file in a screen folder",
      "src/features/home/screens/StrayScreen/useFoo.ts",
      "project-structure/folder-structure",
    ],
    [
      "a screen view importing useForm",
      "src/features/home/screens/FormScreen/FormScreen.tsx",
      "@typescript-eslint/no-restricted-imports",
    ],
    [
      "an svg file import",
      "src/shared/utils/usesSvgFile.ts",
      "rn-tempo/restricted-syntax",
    ],
    [
      "react-native-svg outside Icon",
      "src/features/auth/utils/usesRnSvg.ts",
      "rn-tempo/dependency-owner",
    ],
    [
      "the document picker outside services/files",
      "src/features/auth/utils/usesFilePicker.ts",
      "rn-tempo/dependency-owner",
    ],
    [
      "a physical key in a styles file",
      "src/shared/utils/styles.ts",
      "rn-tempo/restricted-syntax",
    ],
    [
      "a physical key in an inline StyleSheet.create",
      "src/features/home/components/Physical/Physical.tsx",
      "rn-tempo/restricted-syntax",
    ],
    ["a file over 300 lines", "src/shared/utils/tooLong.ts", "max-lines"],
    ["too many parameters", "src/shared/utils/manyParams.ts", "max-params"],
    ["nesting deeper than 4", "src/shared/utils/deepNesting.ts", "max-depth"],
    [
      "an arrow function with a block body",
      "src/shared/utils/arrowBody.ts",
      "arrow-body-style",
    ],
    [
      "an empty component that is not self-closing",
      "src/shared/utils/selfClosing.tsx",
      "@stylistic/jsx-self-closing-comp",
    ],
    [
      "async-storage",
      "src/shared/utils/usesAsyncStorage.ts",
      "rn-tempo/restricted-syntax",
    ],
    [
      "a parent import",
      "src/shared/utils/parentImport.ts",
      "rn-tempo/restricted-syntax",
    ],
    [
      "export star",
      "src/shared/utils/exportStar.ts",
      "rn-tempo/restricted-syntax",
    ],
    [
      "process.env outside config",
      "src/shared/utils/readsProcessEnv.ts",
      "rn-tempo/restricted-syntax",
    ],
    [
      "branching on an environment name",
      "src/shared/utils/branchesOnEnv.ts",
      "rn-tempo/restricted-syntax",
    ],
    [
      "a color literal",
      "src/shared/utils/colorLiteral.ts",
      "rn-tempo/restricted-syntax",
    ],
    [
      "Appearance outside theme and app",
      "src/shared/utils/usesAppearance.ts",
      "rn-tempo/restricted-syntax",
    ],
    [
      "StatusBar outside theme and app",
      "src/shared/utils/usesStatusBar.ts",
      "rn-tempo/restricted-syntax",
    ],
    [
      "owned packages imported by a non-owner",
      "src/shared/utils/ownedImports.ts",
      "rn-tempo/dependency-owner",
    ],
    [
      "getByTestId in a test",
      "src/shared/utils/byTestId.test.ts",
      "rn-tempo/discouraged-syntax",
    ],
  ];

  it("reports the logical-properties messages", async () => {
    const texts = await lintMessages("invalid", "src/shared/utils/styles.ts");
    expect(texts.join("\n")).toMatch(/logical style keys/);
    expect(texts.join("\n")).toMatch(/do not mirror/);
  });

  it("keeps the enum ban next to the style restrictions", async () => {
    const texts = await lintMessages("invalid", "src/shared/types/status.ts");
    expect(texts.join("\n")).toMatch(/Enums are forbidden/);
  });

  it("reports the guidance of every restriction entry and owned dependency", async () => {
    const messages = [
      ...RESTRICTED_SYNTAX_ENTRIES,
      ...DISCOURAGED_SYNTAX_ENTRIES,
    ].map((entry) => entry.message);
    const seen = new Set();
    for (const file of Object.keys(invalid)) {
      for (const text of await lintMessages("invalid", file)) seen.add(text);
    }
    const all = [...seen].join("\n");
    const missing = messages.filter((message) => !all.includes(message));
    expect(missing).toEqual([]);
    for (const [name, entry] of Object.entries(DEPENDENCY_POLICY)) {
      if (entry.kind === "free") continue;
      const message = entry.message ?? entry.reason;
      expect(all, `no fixture reports the ownership of ${name}`).toContain(
        message,
      );
    }
  }, 120_000);

  it("covers at least 12 invalid cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(12);
  });

  it.each(cases)("rejects %s (%s)", (_name, file, rule) => {
    expect(invalid[file], `${file} was not linted`).toBeDefined();
    expect(invalid[file]).toContain(rule);
  });
});
