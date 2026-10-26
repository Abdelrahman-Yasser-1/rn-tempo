import { useTranslation } from 'react-i18next';

import { queryClient } from '@services/http/queryClient';
import { APP_CONFIG_QUERY_KEY, useAppConfig } from '@services/remote-config/remoteConfig';

import { MessageButton, MessageScreen } from '../MessageScreen';

type Props = {
  /** Re-runs startup; defaults to refetching the remote config. */
  onRetry?: () => void;
};

const refetchConfig = (): void => {
  void queryClient.refetchQueries({ queryKey: APP_CONFIG_QUERY_KEY });
};

/** Blocking screen shown while the backend reports maintenance mode. */
export function MaintenanceScreen({ onRetry = refetchConfig }: Readonly<Props>) {
  const { t } = useTranslation('app');
  const { data } = useAppConfig();

  return (
    <MessageScreen
      message={data?.maintenance.message ?? t('maintenance.message')}
      testID="maintenance-screen"
      title={t('maintenance.title')}
    >
      <MessageButton
        label={t('maintenance.retryButton')}
        onPress={onRetry}
        testID="maintenance.retry-button"
      />
    </MessageScreen>
  );
}
