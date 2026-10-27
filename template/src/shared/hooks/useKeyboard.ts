import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

const SHOW_EVENT = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE_EVENT = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

/** Software keyboard visibility and height (0 when hidden). */
export function useKeyboard() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener(SHOW_EVENT, (event) => {
      setHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener(HIDE_EVENT, () => {
      setHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return { isVisible: height > 0, height };
}
