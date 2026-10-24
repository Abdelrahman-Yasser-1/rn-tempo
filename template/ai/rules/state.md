---
description: Zustand for client state, TanStack Query for server state; never put tokens in stores.
globs: src/**/store/**,src/**/*.store.ts,src/**/queries.ts,src/**/mutations.ts
---

# State

Client state lives in Zustand; server state lives in TanStack Query. Never copy server data into a store.

- **Zustand** (`zustand` 5): one store per `features/<name>/store/<name>.store.ts`, with a test `<name>.store.test.ts`. Expose small selector hooks from the feature `index.ts`; do not export the raw store when a hook is enough.
- Persist a store only when needed, through the MMKV `zustandStorage` adapter (`@services/storage/zustandStorage`). The MMKV key is `zustand.<store-name>`.
- **TanStack Query** (`@tanstack/react-query` 5): all reads and writes against the API. The shared `queryClient` (`@services/http/queryClient`) sets `staleTime` 30 s, `gcTime` 5 min, `retry` max 2 for retryable errors, and wires `onlineManager` and `focusManager`.
- **Tokens never go into Zustand or MMKV.** Access/refresh tokens live in `@services/secure-storage` (`tokenStore`, Keychain service `<bundleId>.auth-tokens`, in-memory cache). The auth store holds only `{ status, user, pendingLink }` and is **not persisted**.
- Flags resolve in this order: debug-menu override (non-prod), `AppConfig.flags`, `FLAG_DEFAULTS` (`src/services/flags/flags.ts`).
- Storage keys are the `STORAGE_KEYS` constants (`@services/storage/keys`: `app.theme`, `app.language`, `app.onboarding-completed`, `app.api-base-url-override` (non-prod only), `zustand.<store-name>`). Never import `react-native-mmkv` or AsyncStorage directly.

```ts
// ✅ client state
export const useOnboardingStore = create<OnboardingState>()((set) => ({
  isCompleted: false,
  complete: () => set({ isCompleted: true }),
}));

// ✅ server state
const { data, isPending } = useItem(itemId); // a hook built on useQuery in features/items/api/queries.ts
```

```ts
// ❌ server data in a store
useItemsStore.setState({ items: await fetchItems() });

// ❌ tokens in a store or MMKV
set({ accessToken });
storage.setString('accessToken', accessToken);
```
