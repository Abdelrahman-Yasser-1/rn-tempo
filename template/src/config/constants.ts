import { version } from '../../package.json';

/** Marketing version, read from package.json so native and JS never disagree. */
export const APP_VERSION: string = version;

/** Prod bundle id / Android namespace. Renamed by `create-tempo-app`; env suffixes are added natively. */
export const APP_BUNDLE_ID = 'com.rntempo.app';
