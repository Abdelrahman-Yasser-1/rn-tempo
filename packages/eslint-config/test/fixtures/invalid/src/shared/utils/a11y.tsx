import { TouchableOpacity, View } from 'react-native';

export const Bad = () => (
  <>
    <View accessibilityRole="notarole" />
    <View accessibilityState={{ bad: true }} />
    <View accessibilityActions={[{ name: 'activate' }]} />
    <View accessible>
      <TouchableOpacity>
        <View />
      </TouchableOpacity>
    </View>
  </>
);
