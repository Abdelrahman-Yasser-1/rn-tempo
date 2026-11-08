const RN_COMPONENTS = [
  "Text",
  "TouchableOpacity",
  "TouchableHighlight",
  "TouchableWithoutFeedback",
  "Image",
  "Button",
  "TextInput",
];

const RN_IMPORT =
  "ImportDeclaration[source.value='react-native'] ImportSpecifier";

/** Import bans that are about *what* is imported, not *who owns a package* (see dependencies.mjs). */
export const IMPORT_ENTRIES = [
  {
    selector: `${RN_IMPORT}[imported.name=/^(${RN_COMPONENTS.join("|")})$/]`,
    message: "Use @shared/components and react-native-unistyles instead.",
    ignores: ["src/shared/components/**"],
  },
  {
    // Never allowed, not even in shared components: styles come from react-native-unistyles.
    selector: `${RN_IMPORT}[imported.name='StyleSheet']`,
    message: "Use StyleSheet from react-native-unistyles instead.",
  },
  {
    selector: String.raw`ImportDeclaration[source.value=/\.svg$/]`,
    message:
      "Use <Icon name=... /> from @shared/components. Add icons with `yarn icons:add` or by dropping the file into src/assets/icons.",
    ignores: ["src/shared/components/Icon/**", "src/assets/generated/**"],
  },
  {
    selector: String.raw`ImportDeclaration[source.value=/^@react-native-async-storage\/async-storage/]`,
    message: "Use @services/storage instead.",
  },
];

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

/** Builds the entries for one scope: `prefix` narrows where a property is looked for. */
function physicalStyleEntries(prefix, scope) {
  return [
    {
      selector: `${prefix}Property[key.name=${PHYSICAL_KEYS}]`,
      message: PHYSICAL_MESSAGE,
      ...scope,
    },
    {
      selector: `${prefix}Property[key.name='textAlign'][value.value=/^(left|right)$/]`,
      message: TEXT_ALIGN_MESSAGE,
      ...scope,
    },
  ];
}

/** Logical properties only: physical keys in `styles.ts` files and in inline `StyleSheet.create` calls. */
export const LOGICAL_PROPERTY_ENTRIES = [
  ...physicalStyleEntries("", { files: ["**/styles.ts"] }),
  ...physicalStyleEntries(`${STYLE_CREATE} `, {
    files: ["**/*.tsx"],
    ignores: ["**/*.test.tsx"],
  }),
];
