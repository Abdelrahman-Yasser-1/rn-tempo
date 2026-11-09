import { useTranslation } from 'react-i18next';

export function useHomeScreen() {
  const { t } = useTranslation();

  return { title: t('home.title') };
}
