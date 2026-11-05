import { ENUM_RESTRICTION } from "./base.mjs";

const RN_COMPONENTS = [
  "Text",
  "TouchableOpacity",
  "TouchableHighlight",
  "TouchableWithoutFeedback",
  "Image",
  "Button",
  "TextInput",
];

const RESTRICTIONS = {
  reactNative: {
    name: "react-native",
    importNames: RN_COMPONENTS,
    message: "Use @shared/components and react-native-unistyles instead.",
  },
  // Never allowed, not even in shared components: styles come from react-native-unistyles.
  reactNativeStyleSheet: {
    name: "react-native",
    importNames: ["StyleSheet"],
    message: "Use StyleSheet from react-native-unistyles instead.",
  },
  config: { name: "react-native-config", message: "Use @config/env instead." },
  asyncStorage: {
    name: "@react-native-async-storage/async-storage",
    message: "Use @services/storage instead.",
  },
  axios: { name: "axios", message: "Only src/services/http may import axios." },
  mmkv: {
    name: "react-native-mmkv",
    message: "Only src/services/storage may import MMKV.",
  },
  documentPicker: {
    name: "@react-native-documents/picker",
    message: "Only src/services/files may import the document picker.",
  },
  imagePicker: {
    name: "react-native-image-picker",
    message: "Only src/services/files may import the image picker.",
  },
  reactNativeSvg: {
    name: "react-native-svg",
    message:
      "Draw icons with <Icon name=... /> from @shared/components; only Icon uses react-native-svg.",
  },
  keychain: {
    name: "react-native-keychain",
    message:
      "Only src/services/secure-storage (and storage/encryptionKey.ts) may import Keychain.",
  },
};

// Pattern restrictions, by key; `allowed` skips them like the path restrictions.
const PATTERN_RESTRICTIONS = {
  svgFiles: {
    group: ["*.svg", "**/*.svg"],
    message:
      "Use <Icon name=... /> from @shared/components. Add icons with `yarn icons:add` or by dropping the file into src/assets/icons.",
  },
};

/**
 * Builds a `no-restricted-imports` entry that skips the named restrictions.
 * @param {string[]} allowed Keys of RESTRICTIONS or PATTERN_RESTRICTIONS that are allowed in the scoped files.
 */
function restrict(allowed = []) {
  const paths = Object.entries(RESTRICTIONS)
    .filter(([key]) => !allowed.includes(key))
    .map(([, value]) => value);
  const patterns = Object.entries(PATTERN_RESTRICTIONS)
    .filter(([key]) => !allowed.includes(key))
    .map(([, value]) => value);
  return ["error", { paths, patterns }];
}

/** Import restrictions (error). Each allowed location re-declares the rule without that entry. */
export function restrictionsConfig() {
  return [
    {
      name: "rn-tempo/restrictions",
      rules: { "no-restricted-imports": restrict() },
    },
    {
      name: "rn-tempo/restrictions/shared-components",
      files: ["src/shared/components/**"],
      rules: { "no-restricted-imports": restrict(["reactNative"]) },
    },
    {
      // Icon draws the generated react-native-svg components; nothing else does.
      name: "rn-tempo/restrictions/icon",
      files: ["src/shared/components/Icon/**", "src/assets/generated/**"],
      rules: {
        "no-restricted-imports": restrict([
          "reactNative",
          "reactNativeSvg",
          "svgFiles",
        ]),
      },
    },
    {
      name: "rn-tempo/restrictions/env",
      files: ["src/config/env.ts"],
      rules: { "no-restricted-imports": restrict(["config"]) },
    },
    {
      name: "rn-tempo/restrictions/http",
      files: ["src/services/http/**"],
      rules: { "no-restricted-imports": restrict(["axios"]) },
    },
    {
      name: "rn-tempo/restrictions/storage",
      files: ["src/services/storage/**"],
      rules: { "no-restricted-imports": restrict(["mmkv"]) },
    },
    {
      name: "rn-tempo/restrictions/files",
      files: ["src/services/files/**"],
      rules: {
        "no-restricted-imports": restrict(["documentPicker", "imagePicker"]),
      },
    },
    {
      name: "rn-tempo/restrictions/storage-key",
      files: ["src/services/storage/encryptionKey.ts"],
      rules: { "no-restricted-imports": restrict(["mmkv", "keychain"]) },
    },
    {
      name: "rn-tempo/restrictions/secure-storage",
      files: ["src/services/secure-storage/**"],
      rules: { "no-restricted-imports": restrict(["keychain"]) },
    },
  ];
}

const SCREEN_LOGIC_MESSAGE =
  "Move screen logic into use<Name>Screen.ts (WS9b convention).";

/**
 * Screen views stay presentational (WS9b): logic imports are warned about. Uses the
 * typescript-eslint rule so type-only imports stay allowed and the core rule block above is
 * not overwritten.
 */
export function screenLogicConfig() {
  return [
    {
      name: "rn-tempo/restrictions/screen-logic",
      files: ["src/**/screens/**/*Screen.tsx"],
      rules: {
        "@typescript-eslint/no-restricted-imports": [
          "warn",
          {
            paths: [
              {
                name: "react-hook-form",
                message: SCREEN_LOGIC_MESSAGE,
                allowTypeImports: true,
              },
              {
                name: "@tanstack/react-query",
                message: SCREEN_LOGIC_MESSAGE,
                allowTypeImports: true,
              },
              {
                name: "@react-navigation/native",
                importNames: ["useNavigation", "useRoute", "useFocusEffect"],
                message: SCREEN_LOGIC_MESSAGE,
                allowTypeImports: true,
              },
              {
                name: "react",
                importNames: ["useState", "useEffect", "useReducer"],
                message: SCREEN_LOGIC_MESSAGE,
                allowTypeImports: true,
              },
            ],
          },
        ],
      },
    },
  ];
}

const STYLE_CREATE =
  "CallExpression[callee.object.name='StyleSheet'][callee.property.name='create']";
const PHYSICAL_KEYS =
  "/^(marginLeft|marginRight|paddingLeft|paddingRight|left|right|border(Left|Right)\\w*|border(Top|Bottom)(Left|Right)Radius)$/";
const PHYSICAL_MESSAGE =
  "Use logical style keys so layouts mirror in Arabic: marginStart/marginEnd, paddingStart/paddingEnd, start/end, borderStartWidth/borderEndWidth, borderTopStartRadius/borderTopEndRadius.";
const TEXT_ALIGN_MESSAGE =
  "textAlign 'left' and 'right' do not mirror in RTL. Use 'auto' (follows the text direction) or 'center'.";

/** Builds the selectors for one scope: `prefix` narrows where a property is looked for. */
function physicalStyleSelectors(prefix) {
  return [
    {
      selector: `${prefix}Property[key.name=${PHYSICAL_KEYS}]`,
      message: PHYSICAL_MESSAGE,
    },
    {
      selector: `${prefix}Property[key.name='textAlign'][value.value=/^(left|right)$/]`,
      message: TEXT_ALIGN_MESSAGE,
    },
  ];
}

/**
 * Logical properties only: physical keys in `styles.ts` files and in inline `StyleSheet.create`
 * calls are errors. `no-restricted-syntax` replaces earlier entries for the same files, so the
 * enum ban is repeated here.
 */
export function logicalPropertiesConfig() {
  return [
    {
      name: "rn-tempo/restrictions/logical-properties-styles",
      files: ["**/styles.ts"],
      rules: {
        "no-restricted-syntax": [
          "error",
          ENUM_RESTRICTION,
          ...physicalStyleSelectors(""),
        ],
      },
    },
    {
      name: "rn-tempo/restrictions/logical-properties-inline",
      files: ["**/*.tsx"],
      ignores: ["**/*.test.tsx"],
      rules: {
        "no-restricted-syntax": [
          "error",
          ENUM_RESTRICTION,
          ...physicalStyleSelectors(`${STYLE_CREATE} `),
        ],
      },
    },
  ];
}
