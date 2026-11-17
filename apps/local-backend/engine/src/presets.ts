import type { BackendInput } from './schema.ts';

/** A starting point for a new backend, as the desktop app lists it. */
export interface PresetInfo {
  id: string;
  name: string;
  description: string;
}

export const presets: readonly PresetInfo[] = [
  { id: 'empty', name: 'Empty', description: 'No collections and no endpoints. Start from scratch.' },
  { id: 'products', name: 'Products', description: 'A small products collection with list, search, get and create endpoints.' },
  {
    id: 'tempo-template',
    name: 'Tempo template',
    description:
      'Everything the Tempo template app calls (contract C13): sign-in, refresh, profile, users, 100 products, OTP and app-config, plus media upload and a stats handler. Sign in as emilys / emilyspass.',
  },
];

/** What a preset writes next to `backend.json`: a path inside the backend folder and its text. */
export interface PresetFile {
  path: string;
  text: string;
}

// ---- Tempo template (data copied from template/api/endpoints; keep in step with it, a test checks the shapes)

const CATALOG_SIZE = 100;
const CATEGORIES = ['beauty', 'fragrances', 'furniture', 'groceries'] as const;

/** Item `n` exactly as the template's mock builds it (`api/endpoints/products.ts`). */
export function templateProduct(n: number): Record<string, unknown> {
  const title = `Product ${String(n)}`;
  return {
    id: n,
    title,
    description: `Description of product ${String(n)}`,
    price: 5 + n,
    category: CATEGORIES[(n - 1) % CATEGORIES.length] ?? 'beauty',
    thumbnail: `https://dummyjson.com/image/200x200?text=${encodeURIComponent(title)}`,
    rating: 3 + (n % 20) / 10,
    stock: 10 + (n % 50),
  };
}

/** The mock app configuration (`api/endpoints/appConfig.ts`): nothing blocks, no flag overrides. */
const APP_CONFIG = {
  minSupportedVersion: { ios: '0.0.0', android: '0.0.0' },
  latestVersion: { ios: '1.0.0', android: '1.0.0' },
  maintenance: { enabled: false },
  flags: {},
  storeUrls: {
    ios: 'https://apps.apple.com/app/id0000000000',
    android: 'https://play.google.com/store/apps/details?id=com.rntempo.app',
  },
};

const STATS_HANDLER = `// GET /stats/summary: how many products and users exist.
// A handler is trusted JavaScript that runs in a worker thread (not a sandbox); this one only reads counts.
export default async function (ctx) {
  const products = await ctx.db.count('products');
  const users = await ctx.users.count();
  ctx.log.info('stats summary', { products, users });
  return { products, users };
}
`;

function tempoTemplate(name: string): { definition: BackendInput; files: PresetFile[] } {
  const crud = { type: 'crud' as const, collection: 'products', tags: ['products'] };
  const definition: BackendInput = {
    name,
    port: 8443,
    https: true,
    auth: {
      // The same demo account as the mock (public test data, never a real credential).
      seedUsers: [
        {
          username: 'emilys',
          password: 'emilyspass',
          email: 'emily.johnson@x.dummyjson.com',
          firstName: 'Emily',
          lastName: 'Johnson',
          gender: 'female',
          image: 'https://dummyjson.com/icon/emilys/128',
        },
      ],
    },
    collections: [
      {
        name: 'products',
        fields: [
          { name: 'title', type: 'string', required: true, default: '' },
          { name: 'description', type: 'string', required: true, default: '' },
          { name: 'price', type: 'number', required: true, default: 0 },
          { name: 'category', type: 'string', required: true, default: '' },
          { name: 'thumbnail', type: 'string', required: true, default: String(templateProduct(CATALOG_SIZE + 1).thumbnail) },
          { name: 'rating', type: 'number', required: true, default: 0 },
          { name: 'stock', type: 'number', required: true, default: 0 },
        ],
        seed: 'products.json',
      },
    ],
    endpoints: [
      { id: 'auth.login', type: 'auth', action: 'login', method: 'POST', path: '/auth/login', summary: 'Sign in', tags: ['auth'] },
      { id: 'auth.refresh', type: 'auth', action: 'refresh', method: 'POST', path: '/auth/refresh', summary: 'Trade a refresh token for new tokens', tags: ['auth'] },
      { id: 'auth.me', type: 'auth', action: 'me', method: 'GET', path: '/auth/me', auth: 'bearer', summary: 'The signed-in user', tags: ['auth'] },
      { id: 'auth.forgotPassword', type: 'auth', action: 'forgotPassword', method: 'POST', path: '/auth/forgot-password', summary: 'Send a password reset code', tags: ['auth'] },
      { id: 'auth.otpVerify', type: 'auth', action: 'otpVerify', method: 'POST', path: '/auth/otp/verify', summary: 'Check a one-time code', tags: ['auth'] },
      { id: 'auth.otpResend', type: 'auth', action: 'otpResend', method: 'POST', path: '/auth/otp/resend', summary: 'Send a new one-time code', tags: ['auth'] },
      { id: 'users.add', type: 'users', action: 'add', method: 'POST', path: '/users/add', summary: 'Register a user', tags: ['users'] },
      { id: 'users.update', type: 'users', action: 'update', method: 'PUT', path: '/users/:id', auth: 'bearer', summary: 'Update a user', tags: ['users'] },
      // `/products/search` is the same list with `q`; it is listed before `/products/:id` (static segments win anyway).
      { ...crud, id: 'products.search', action: 'list', method: 'GET', path: '/products/search', searchFields: ['title'], summary: 'Search products by title' },
      { ...crud, id: 'products.list', action: 'list', method: 'GET', path: '/products', summary: 'List products' },
      { ...crud, id: 'products.get', action: 'get', method: 'GET', path: '/products/:id', summary: 'Get one product' },
      {
        ...crud,
        id: 'products.create',
        action: 'create',
        method: 'POST',
        path: '/products',
        aliases: ['/products/add'],
        unknownFields: 'strip',
        summary: 'Add a product',
      },
      // The app configuration is a static body: edit it in the Endpoints tab (or backend.json) to flip maintenance or flags.
      {
        id: 'appConfig.get',
        type: 'static',
        method: 'GET',
        path: '/app-config',
        body: APP_CONFIG,
        summary: 'Remote app configuration',
        tags: ['app-config'],
        scenarios: {
          maintenance: { body: { ...APP_CONFIG, maintenance: { enabled: true, message: 'Back soon.' } } },
          forceUpdate: { body: { ...APP_CONFIG, minSupportedVersion: { ios: '99.0.0', android: '99.0.0' } } },
        },
      },
      { id: 'media.upload', type: 'upload', method: 'POST', path: '/media/upload', summary: 'Upload a file', tags: ['media'] },
      { id: 'media.download', type: 'download', method: 'GET', path: '/media/:id', summary: 'Download a file', tags: ['media'] },
      { id: 'stats.summary', type: 'handler', method: 'GET', path: '/stats/summary', file: 'handlers/stats-summary.js', summary: 'Counts of products and users (a handler example)', tags: ['stats'] },
    ],
  };
  const products = Array.from({ length: CATALOG_SIZE }, (_, index) => templateProduct(index + 1));
  return {
    definition,
    files: [
      { path: 'seed/products.json', text: `${JSON.stringify(products, null, 2)}\n` },
      { path: 'handlers/stats-summary.js', text: STATS_HANDLER },
    ],
  };
}

/** The definition and the extra files (seed data, handlers) of a preset that needs them; `undefined` for the others. */
export function presetBundle(id: string, name: string): { definition: BackendInput; files: PresetFile[] } | undefined {
  return id === 'tempo-template' ? tempoTemplate(name) : undefined;
}
