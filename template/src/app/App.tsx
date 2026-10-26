import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';
import { useEffect, useMemo, type ComponentType } from 'react';
import { StatusBar } from 'react-native';

import { linking, startPendingLinkResume } from '@navigation/linking';
import { navigationRef } from '@navigation/navigationRef';
import { createRootNavigator } from '@navigation/RootNavigator';
import { startNetworkMonitoring } from '@services/network/network';
import { useAppTheme } from '@theme/index';

import { useSecurityStore } from './bootstrap/securityStore';
import { useBootstrap, type BootstrapState } from './bootstrap/useBootstrap';
import { AppProviders } from './providers/AppProviders';
import { DebugMenuScreen } from './screens/DebugMenuScreen';
import { ForceUpdateScreen } from './screens/ForceUpdateScreen';
import { MaintenanceScreen } from './screens/MaintenanceScreen';
import { NotFoundScreen } from './screens/NotFoundScreen';
import { PlaceholderScreen } from './screens/PlaceholderScreen';
import { SecurityErrorScreen } from './screens/SecurityErrorScreen';
import { StartupErrorScreen } from './screens/StartupErrorScreen';

const Navigation = createRootNavigator({
  Placeholder: PlaceholderScreen,
  ForceUpdate: ForceUpdateScreen,
  Maintenance: MaintenanceScreen,
  NotFound: NotFoundScreen,
  DebugMenu: DebugMenuScreen,
});

// Metro drops this branch from release bundles (`__DEV__` is a compile-time false), so the
// Rozenite plugins never ship. They need storage, hence they mount only after bootstrap.
const DevTools: ComponentType | undefined = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- must stay a guarded require so release bundles exclude it
    (require('./providers/DevTools') as { DevTools: ComponentType }).DevTools
  : undefined;

function useNavigationTheme(): Theme {
  const { theme } = useAppTheme();
  return useMemo(() => {
    const base = theme.name === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.primary,
        background: theme.colors.background,
        card: theme.colors.surface,
        text: theme.colors.textPrimary,
        border: theme.colors.border,
        notification: theme.colors.error,
      },
    };
  }, [theme]);
}

function BlockedScreen({ state, retry }: Readonly<{ state: BootstrapState; retry: () => void }>) {
  if (state.status !== 'blocked') {
    return null;
  }
  switch (state.blockReason) {
    case 'security':
      return <SecurityErrorScreen reasons={state.securityReasons} />;
    case 'forceUpdate':
      return <ForceUpdateScreen />;
    case 'maintenance':
      return <MaintenanceScreen onRetry={retry} />;
    case 'startupError':
      return <StartupErrorScreen onRetry={retry} />;
  }
}

function AppContent() {
  const bootstrap = useBootstrap();
  const runtimeCompromise = useSecurityStore((state) => state.compromisedReasons);
  const navigationTheme = useNavigationTheme();
  const { theme } = useAppTheme();

  useEffect(() => startNetworkMonitoring(), []);
  useEffect(() => startPendingLinkResume(), []);

  if (bootstrap.status === 'loading') {
    // The native splash is still visible; nothing to draw yet.
    return null;
  }
  if (runtimeCompromise.length > 0) {
    return <SecurityErrorScreen reasons={runtimeCompromise} />;
  }
  if (bootstrap.status === 'blocked') {
    return <BlockedScreen retry={bootstrap.retry} state={bootstrap} />;
  }
  return (
    <>
      <StatusBar barStyle={theme.name === 'dark' ? 'light-content' : 'dark-content'} />
      <Navigation linking={linking} ref={navigationRef} theme={navigationTheme} />
      {DevTools ? <DevTools /> : null}
    </>
  );
}

/** Application root: providers, then startup gate, then navigation. */
export function App() {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}
