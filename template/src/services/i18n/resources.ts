import arApp from '@locales/ar/app.json';
import arAuth from '@locales/ar/auth.json';
import arCommon from '@locales/ar/common.json';
import arErrors from '@locales/ar/errors.json';
import arForms from '@locales/ar/forms.json'; // @tempo-feature:dynamic-forms
import arHome from '@locales/ar/home.json';
import arItems from '@locales/ar/items.json'; // @tempo-feature:samples
import arProfile from '@locales/ar/profile.json';
import arSettings from '@locales/ar/settings.json';
import arValidation from '@locales/ar/validation.json';
import enApp from '@locales/en/app.json';
import enAuth from '@locales/en/auth.json';
import enCommon from '@locales/en/common.json';
import enErrors from '@locales/en/errors.json';
import enForms from '@locales/en/forms.json'; // @tempo-feature:dynamic-forms
import enHome from '@locales/en/home.json';
import enItems from '@locales/en/items.json'; // @tempo-feature:samples
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
    items: enItems, // @tempo-feature:samples
    app: enApp,
    forms: enForms, // @tempo-feature:dynamic-forms
  },
  ar: {
    common: arCommon,
    errors: arErrors,
    validation: arValidation,
    auth: arAuth,
    home: arHome,
    profile: arProfile,
    settings: arSettings,
    items: arItems, // @tempo-feature:samples
    app: arApp,
    forms: arForms, // @tempo-feature:dynamic-forms
  },
};

export const DEFAULT_NAMESPACE = 'common';
