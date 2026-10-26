/** Marketing version, inlined from package.json at build time so native and JS never disagree. */
export const APP_VERSION: string = __APP_VERSION__;

/** Prod bundle id / Android namespace. Renamed by `create-tempo-app`; env suffixes are added natively. */
export const APP_BUNDLE_ID = 'com.rntempo.app';
