import { StyleSheet } from 'react-native-unistyles';

export const PIN_SIZE = 40;

export const styles = StyleSheet.create((theme) => ({
  body: {
    gap: theme.spacing.sm,
  },
  mapFrame: (height: number) => ({
    height,
    overflow: 'hidden',
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
  }),
  map: {
    flex: 1,
  },
  // The pin's tip sits on the exact centre of the map: the pin is lifted by its own height.
  pinLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    marginBottom: PIN_SIZE,
  },
  myLocation: {
    position: 'absolute',
    end: theme.spacing.md,
    bottom: theme.spacing.md,
  },
}));
