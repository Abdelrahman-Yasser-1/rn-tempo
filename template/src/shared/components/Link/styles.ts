import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create({
  root: {
    alignSelf: 'flex-start',
  },
  text: {
    variants: {
      variant: {
        underline: { textDecorationLine: 'underline' },
        plain: { textDecorationLine: 'none' },
      },
    },
  },
});
