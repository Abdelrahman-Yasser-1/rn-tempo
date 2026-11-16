import { http } from 'msw';

/** msw is owned by test-utils and the generated handlers only. */
export const usesMsw = http;
