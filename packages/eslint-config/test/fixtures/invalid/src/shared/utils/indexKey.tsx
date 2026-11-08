import { View } from 'react-native';

export const rows = ['a', 'b'].map((label, index) => <View key={index} accessibilityLabel={label} />);
