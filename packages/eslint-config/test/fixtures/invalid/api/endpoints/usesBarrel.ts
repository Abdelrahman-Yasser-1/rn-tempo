import { HomeScreen } from '@features/home';

/** An endpoint file runs in Node, so it must not import a feature barrel. */
export const usesBarrel = HomeScreen;
