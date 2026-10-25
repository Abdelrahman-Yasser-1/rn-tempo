/* eslint-disable no-restricted-imports -- sample test of the helper itself; no shared Text exists yet */
import { screen } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import { createElement, useEffect, useState } from 'react';
import { Text } from 'react-native';

import { useAuthStore } from '@features/auth';
import { i18n } from '@services/i18n/i18n';

import { server } from './msw/server';
import { renderWithProviders } from './renderWithProviders';

const PING_URL = 'https://api.test/ping';

function Ping() {
  const [message, setMessage] = useState('loading');
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const response = await fetch(PING_URL, { signal: controller.signal });
      const body = (await response.json()) as { message: string };
      setMessage(body.message);
    };
    void load();
    return () => {
      controller.abort();
    };
  }, []);
  return createElement(Text, null, message);
}

describe('renderWithProviders', () => {
  test('AC-1: renders a Text through the providers', async () => {
    await renderWithProviders(createElement(Text, null, 'hello'));

    expect(screen.getByText('hello')).toBeOnTheScreen();
  });

  test('AC-3: the language option initialises i18n', async () => {
    await renderWithProviders(createElement(Text, null, 'x'), { language: 'ar' });

    expect(i18n.language).toBe('ar');
  });

  test('authenticated seeds the auth store', async () => {
    await renderWithProviders(createElement(Text, null, 'x'), { authenticated: true });
    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(useAuthStore.getState().user).not.toBeNull();

    await renderWithProviders(createElement(Text, null, 'x'), { authenticated: false });
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', user: null });
  });

  test('AC-1: an MSW-mocked request resolves', async () => {
    server.use(http.get(PING_URL, () => HttpResponse.json({ message: 'pong' })));

    await renderWithProviders(createElement(Ping));

    expect(await screen.findByText('pong')).toBeOnTheScreen();
  });
});
