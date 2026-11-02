/** Deep link paths of contract C12 (trimmed copy of the template's linking.ts). */
export const LINK_PATHS = {
  Home: 'home',
  ItemsList: 'items',
  ItemCreate: 'items/new',
  ItemDetails: 'items/:itemId',
  Profile: 'profile',
  DebugMenu: 'debug',
} as const;

export const linkingPrefixes: string[] = ['tempo://'];
