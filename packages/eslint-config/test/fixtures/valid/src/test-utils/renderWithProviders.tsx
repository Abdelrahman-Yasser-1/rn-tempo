import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

export function renderWithProviders(element: ReactElement) {
  render(element);
}
