import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { appIconService } from '@services/app-icon';
import { toast } from '@services/toast/toast';
import { useOnFocus } from '@shared/hooks/useOnFocus';

/** The picker and its Settings row share the native selection, refreshed on every focus. */
export function useCurrentAppIcon() {
  const { t } = useTranslation('settings');
  const isSupported = appIconService.isSupported();
  const { data, refetch, isPending } = useQuery({
    queryKey: ['settings', 'app-icon'],
    queryFn: () => appIconService.getIcon(),
    enabled: false,
    networkMode: 'always',
    retry: false,
  });
  const refresh = async () => {
    if (isSupported && (await refetch()).isError) {
      toast.error(t('appIcon.readError'));
    }
  };
  useOnFocus(() => {
    void refresh();
  });
  const names = {
    default: t('appIcon.default'),
    ocean: t('appIcon.ocean'),
    forest: t('appIcon.forest'),
    sunset: t('appIcon.sunset'),
  };
  return { value: isSupported ? data : 'default', names, isSupported, isPending, refresh } as const;
}
