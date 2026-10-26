const base = require('@react-native/jest-preset/jest-preset');
const aliases = Object.fromEntries(
  ['app','navigation','features','shared','services','theme','assets','locales','config','test-utils'].map((a) => [`^@${a}/(.*)$`, `<rootDir>/src/${a}/$1`]),
);
module.exports = {
  ...base,
  testPathIgnorePatterns: ['/node_modules/', '/scripts/', '/e2e/'],
  setupFiles: [...base.setupFiles, '<rootDir>/jest.setup.ws4.ts'],
  moduleNameMapper: { ...base.moduleNameMapper, ...aliases, '\\.svg$': '<rootDir>/jest.svg.ws4.js' },
  transformIgnorePatterns: ['node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-unistyles|react-native-nitro-modules|@gorhom|react-native-reanimated|react-native-worklets|react-native-gesture-handler|react-native-toast-message|react-native-fast-shimmer|@d11|react-native-svg|@testing-library|test-renderer)/)'],
};
