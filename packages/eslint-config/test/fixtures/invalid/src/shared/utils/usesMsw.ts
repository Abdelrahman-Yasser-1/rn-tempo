import { http } from 'msw';

/** msw is owned by test-utils only. */
export const usesMsw = http;
