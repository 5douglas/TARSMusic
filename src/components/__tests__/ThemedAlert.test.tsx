import React from 'react';
import { render, screen } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 30, bottom: 48, left: 0, right: 0 }),
}));

import { ThemedAlert } from '../ThemedAlert';

const colors = { card: '#111', textPrimary: '#fff', textSecondary: '#aaa', border: '#333', primary: '#1D9BF0', red: '#f00' } as any;

it('keeps the card clear of the system bars and scrolls a long message', () => {
  render(
    <ThemedAlert
      visible
      title="Update"
      message={'line\n'.repeat(200)}
      buttons={[{ text: 'Later', style: 'cancel' }, { text: 'Install' }]}
      onDismiss={() => {}}
      colors={colors}
    />,
  );
  expect(screen.getByText('Install')).toBeTruthy();
  expect(screen.UNSAFE_getByType(require('react-native').ScrollView)).toBeTruthy();
  const container = screen.getByText('Update').parent?.parent?.parent;
  expect(JSON.stringify(container?.props.style)).toContain('"paddingBottom":72');
});
