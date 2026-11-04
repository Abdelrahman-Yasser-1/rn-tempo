import type { PressableProps } from 'react-native';

export type SwitchLabelPosition = 'start' | 'end';

export type SwitchProps = Readonly<
  Omit<PressableProps, 'children' | 'style' | 'onPress' | 'disabled'> & {
    value: boolean;
    onValueChange: (value: boolean) => void;
    label?: string;
    /**
     * Which side of the track the label sits on, in the reading direction. `start` (default)
     * pushes the track to the far edge; `end` keeps the label right next to the track.
     */
    labelPosition?: SwitchLabelPosition;
    disabled?: boolean;
  }
>;
