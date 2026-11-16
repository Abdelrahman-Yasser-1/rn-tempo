import { defineConfig } from '@rn-tempo/api-contract';

import { getAppConfig } from './endpoints/appConfig';
import { login, me, refresh } from './endpoints/auth';
import { forgotPassword, resendOtp, verifyOtp } from './endpoints/authExtra';
// @tempo-feature:samples:start
import { addProduct, getProduct, listProducts, searchProducts } from './endpoints/products';
// @tempo-feature:samples:end
import { addUser, updateUser } from './endpoints/users';

/**
 * The app's API (contract C13), defined once. Three things read it:
 * - `yarn api up` serves it as a local mock server,
 * - the Jest MSW handlers (`api/generated/msw-handlers.ts`) answer from it,
 * - the in-app mock mode (`API_MOCKING=true`) answers from it.
 *
 * After changing an endpoint run `yarn api generate`; `yarn api:check` fails on stale output.
 */
export default defineConfig({
  // Auth is defined by the endpoints below (fixed demo tokens), not by the dev API's mock login.
  auth: false,
  endpoints: [
    login,
    refresh,
    me,
    forgotPassword,
    verifyOtp,
    resendOtp,
    addUser,
    updateUser,
    // @tempo-feature:samples:start
    // Static `/products/search` before `/products/:id`.
    searchProducts,
    listProducts,
    getProduct,
    addProduct,
    // @tempo-feature:samples:end
    getAppConfig,
  ],
});
