import { isKnownLinkPath } from '@navigation/linking';
import { initPush as startPush } from '@services/push/push';
import { setPushPathValidator } from '@services/push/routing';

/**
 * Bootstrap step: starts push notifications after the session is known. Links in a notification
 * are checked against the app's own deep link paths. Does nothing when Firebase is not configured.
 */
export async function initPush(): Promise<void> {
  setPushPathValidator(isKnownLinkPath);
  await startPush();
}
