/* eslint-disable import-x/no-default-export -- svg imports resolve to a default export */
import { View } from 'react-native';

/** Jest stand-in for `.svg` imports (react-native-svg-transformer is Metro-only). */
export default function SvgMock(props: Readonly<Record<string, unknown>>) {
  return <View {...props} />;
}
