import arApp from '@locales/ar/app.json';
import arAuth from '@locales/ar/auth.json';
import arCommon from '@locales/ar/common.json';
import arErrors from '@locales/ar/errors.json';
import arHome from '@locales/ar/home.json';
import arItems from '@locales/ar/items.json'; // @tempo-feature:samples
import arProfile from '@locales/ar/profile.json';
import arSettings from '@locales/ar/settings.json';
import arValidation from '@locales/ar/validation.json';
import arWhatsNew from '@locales/ar/whats-new.json'; // @tempo-feature:cms
import deApp from '@locales/de/app.json';
import deAuth from '@locales/de/auth.json';
import deCommon from '@locales/de/common.json';
import deErrors from '@locales/de/errors.json';
import deHome from '@locales/de/home.json';
import deItems from '@locales/de/items.json'; // @tempo-feature:samples
import deProfile from '@locales/de/profile.json';
import deSettings from '@locales/de/settings.json';
import deValidation from '@locales/de/validation.json';
import deWhatsNew from '@locales/de/whats-new.json'; // @tempo-feature:cms
import enApp from '@locales/en/app.json';
import enAuth from '@locales/en/auth.json';
import enCommon from '@locales/en/common.json';
import enErrors from '@locales/en/errors.json';
import enHome from '@locales/en/home.json';
import enItems from '@locales/en/items.json'; // @tempo-feature:samples
import enProfile from '@locales/en/profile.json';
import enSettings from '@locales/en/settings.json';
import enValidation from '@locales/en/validation.json';
import enWhatsNew from '@locales/en/whats-new.json'; // @tempo-feature:cms
import esApp from '@locales/es/app.json';
import esAuth from '@locales/es/auth.json';
import esCommon from '@locales/es/common.json';
import esErrors from '@locales/es/errors.json';
import esHome from '@locales/es/home.json';
import esItems from '@locales/es/items.json'; // @tempo-feature:samples
import esProfile from '@locales/es/profile.json';
import esSettings from '@locales/es/settings.json';
import esValidation from '@locales/es/validation.json';
import esWhatsNew from '@locales/es/whats-new.json'; // @tempo-feature:cms
import frApp from '@locales/fr/app.json';
import frAuth from '@locales/fr/auth.json';
import frCommon from '@locales/fr/common.json';
import frErrors from '@locales/fr/errors.json';
import frHome from '@locales/fr/home.json';
import frItems from '@locales/fr/items.json'; // @tempo-feature:samples
import frProfile from '@locales/fr/profile.json';
import frSettings from '@locales/fr/settings.json';
import frValidation from '@locales/fr/validation.json';
import frWhatsNew from '@locales/fr/whats-new.json'; // @tempo-feature:cms

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
    'whats-new': enWhatsNew, // @tempo-feature:cms
    app: enApp,
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
    'whats-new': arWhatsNew, // @tempo-feature:cms
    app: arApp,
  },
  es: {
    common: esCommon,
    errors: esErrors,
    validation: esValidation,
    auth: esAuth,
    home: esHome,
    profile: esProfile,
    settings: esSettings,
    items: esItems, // @tempo-feature:samples
    'whats-new': esWhatsNew, // @tempo-feature:cms
    app: esApp,
  },
  de: {
    common: deCommon,
    errors: deErrors,
    validation: deValidation,
    auth: deAuth,
    home: deHome,
    profile: deProfile,
    settings: deSettings,
    items: deItems, // @tempo-feature:samples
    'whats-new': deWhatsNew, // @tempo-feature:cms
    app: deApp,
  },
  fr: {
    common: frCommon,
    errors: frErrors,
    validation: frValidation,
    auth: frAuth,
    home: frHome,
    profile: frProfile,
    settings: frSettings,
    items: frItems, // @tempo-feature:samples
    'whats-new': frWhatsNew, // @tempo-feature:cms
    app: frApp,
  },
};

export const DEFAULT_NAMESPACE = 'common';
