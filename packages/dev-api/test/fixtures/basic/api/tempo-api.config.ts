import { defineConfig, defineEndpoint, resource } from '@rn-tempo/api-contract';

import { Product, Profile } from '@features/products/schema';

export default defineConfig({
  seed: 7,
  auth: true,
  endpoints: [
    resource('products', Product, { seed: 5, searchBy: ['title'] }),
    defineEndpoint({ method: 'GET', path: '/profile', response: Profile }),
  ],
});
