import arApp from '@locales/ar/app.json';
import arAuth from '@locales/ar/auth.json';
import arCommon from '@locales/ar/common.json';
import arErrors from '@locales/ar/errors.json';
import arForms from '@locales/ar/forms.json';
import arHome from '@locales/ar/home.json';
import arItems from '@locales/ar/items.json';
import arProfile from '@locales/ar/profile.json';
import arSettings from '@locales/ar/settings.json';
import arValidation from '@locales/ar/validation.json';
import enApp from '@locales/en/app.json';
import enAuth from '@locales/en/auth.json';
import enCommon from '@locales/en/common.json';
import enErrors from '@locales/en/errors.json';
import enForms from '@locales/en/forms.json';
import enHome from '@locales/en/home.json';
import enItems from '@locales/en/items.json';
import enProfile from '@locales/en/profile.json';
import enSettings from '@locales/en/settings.json';
import enValidation from '@locales/en/validation.json';

/** Static resources: every namespace of contract C11, bundled so first render never waits. */
export const resources = {
  en: {
    common: enCommon,
    errors: enErrors,
    validation: enValidation,
    auth: enAuth,
    home: enHome,
    profile: enProfile,
    settings: enSettings,
    items: enItems,
    app: enApp,
    forms: enForms,
  },
  ar: {
    common: arCommon,
    errors: arErrors,
    validation: arValidation,
    auth: arAuth,
    home: arHome,
    profile: arProfile,
    settings: arSettings,
    items: arItems,
    app: arApp,
    forms: arForms,
  },
};

export const DEFAULT_NAMESPACE = 'common';
