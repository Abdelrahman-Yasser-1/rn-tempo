import { StyleSheet, View } from 'react-native';

const styles = StyleSheet.create({
  unused: { flex: 1 },
  tinted: { color: 'red' },
});

export const Tinted = () => <View style={styles.tinted} />;
