import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCurrentAppIcon } from '@features/settings/hooks/useCurrentAppIcon';
import type { SettingsStackParamList } from '@navigation/types';
import { appIconService, type AppIconName } from '@services/app-icon';
import { toast } from '@services/toast/toast';

const options = ['default', 'ocean', 'forest', 'sunset'] as const satisfies readonly AppIconName[];

export function useAppIconScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList, 'AppIcon'>>();
  const { t } = useTranslation('settings');
  const { value, names, isSupported, isPending, refresh } = useCurrentAppIcon();
  const busyRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);

  const change = async (next: string) => {
    const icon = options.find((name) => name === next);
    if (!isSupported || isPending || busyRef.current || !icon || icon === value) {
      return;
    }
    busyRef.current = true;
    setIsSaving(true);
    try {
      await appIconService.setIcon(icon);
      await refresh();
    } catch {
      toast.error(t('appIcon.changeError'));
    } finally {
      busyRef.current = false;
      setIsSaving(false);
    }
  };

  return {
    value,
    names,
    isSupported,
    options,
    disabled: isPending || isSaving,
    onChange: (next: string) => {
      void change(next);
    },
    onBack: navigation.goBack,
  };
}
