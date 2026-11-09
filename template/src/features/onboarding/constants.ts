import { keyFromSelector } from 'i18next';
import type { SelectorKey } from 'i18next';

import type { IconName } from '@assets/generated/icons.types';

export type Slide = Readonly<{
  id: string;
  icon: IconName;
  /** Keys of the `app` namespace; translate with `t(slide.titleKey, { ns: 'app' })`. */
  titleKey: SelectorKey;
  bodyKey: SelectorKey;
}>;

export const SLIDES: readonly Slide[] = [
  {
    id: 'welcome',
    icon: 'home',
    titleKey: keyFromSelector(($) => $.onboarding.slide1.title, { ns: 'app' }),
    bodyKey: keyFromSelector(($) => $.onboarding.slide1.body, { ns: 'app' }),
  },
  {
    id: 'language',
    icon: 'globe',
    titleKey: keyFromSelector(($) => $.onboarding.slide2.title, { ns: 'app' }),
    bodyKey: keyFromSelector(($) => $.onboarding.slide2.body, { ns: 'app' }),
  },
  {
    id: 'ready',
    icon: 'check',
    titleKey: keyFromSelector(($) => $.onboarding.slide3.title, { ns: 'app' }),
    bodyKey: keyFromSelector(($) => $.onboarding.slide3.body, { ns: 'app' }),
  },
];
