/** Text to a list: split on commas or new lines, trimmed, without empty entries. */
export const splitList = (text: string): string[] =>
  text
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter((part) => part !== '');

/** A percentage typed as text ("50") to a share from 0 to 1, or `null` when it is not a number from 0 to 100. */
export function percentToRate(text: string): number | null {
  if (text.trim() === '') return 0;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value / 100 : null;
}

/** A whole number within bounds, or `null`. */
export function wholeIn(text: string, min: number, max: number): number | null {
  return /^\d{1,9}$/.test(text.trim()) && Number(text) >= min && Number(text) <= max ? Number(text) : null;
}

/** The config an app pastes into `react-native-app-auth` for the mock provider. */
export function appAuthSnippet(endpoints: { issuer: string; authorizationEndpoint: string; tokenEndpoint: string }, clientId: string, redirectUrl: string): string {
  return `const config = {
  issuer: '${endpoints.issuer}',
  clientId: '${clientId}',
  redirectUrl: '${redirectUrl}',
  scopes: ['openid', 'profile', 'email'],
  serviceConfiguration: {
    authorizationEndpoint: '${endpoints.authorizationEndpoint}',
    tokenEndpoint: '${endpoints.tokenEndpoint}',
  },
  usePKCE: true,
};`;
}
