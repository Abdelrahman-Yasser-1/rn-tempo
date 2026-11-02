import type { IconName } from '@assets/icons';

export type Slide = Readonly<{
  id: string;
  icon: IconName;
  titleKey: 'onboarding.slide1.title' | 'onboarding.slide2.title' | 'onboarding.slide3.title';
  bodyKey: 'onboarding.slide1.body' | 'onboarding.slide2.body' | 'onboarding.slide3.body';
}>;

// Keys of the `app` namespace, declared here so the i18n extractor keeps them.
// t('onboarding.slide1.title', { ns: 'app', defaultValue: 'Welcome' })
// t('onboarding.slide1.body', { ns: 'app', defaultValue: 'A production-ready starting point for your next app.' })
// t('onboarding.slide2.title', { ns: 'app', defaultValue: 'Your language, your way' })
// t('onboarding.slide2.body', { ns: 'app', defaultValue: 'Switch between English and Arabic, with full right-to-left support.' })
// t('onboarding.slide3.title', { ns: 'app', defaultValue: 'Ready to go' })
// t('onboarding.slide3.body', { ns: 'app', defaultValue: 'Sign in or create an account to get started.' })
export const SLIDES: readonly Slide[] = [
  {
    id: 'welcome',
    icon: 'home',
    titleKey: 'onboarding.slide1.title',
    bodyKey: 'onboarding.slide1.body',
  },
  {
    id: 'language',
    icon: 'globe',
    titleKey: 'onboarding.slide2.title',
    bodyKey: 'onboarding.slide2.body',
  },
  {
    id: 'ready',
    icon: 'check',
    titleKey: 'onboarding.slide3.title',
    bodyKey: 'onboarding.slide3.body',
  },
];
