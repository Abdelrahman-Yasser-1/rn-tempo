# Review checklist: what lint cannot see

Lint and `yarn verify` already cover imports, types, tokens, i18n key parity and file names. Check these by reading the code and running the app.

- [ ] Logic lives in hooks (`use<Name>Screen`, `use<Name>`), not in views or handlers inline in JSX.
- [ ] Every screen and list has a loading state, an empty state and an error state with a way to retry.
- [ ] Loading states do not flash for fast responses and do not block content that is already cached.
- [ ] Accessibility labels make sense when read aloud, in both languages; decorative elements are hidden from screen readers.
- [ ] RTL checked visually: icon direction, alignment, padding, swipe and back gestures, mixed-direction text.
- [ ] Layout survives font scale 200% and a small screen.
- [ ] No secrets, tokens, passwords or personal data in logs, error messages, analytics or crash reports.
- [ ] Mutations invalidate or update every query key they affect, and nothing else.
- [ ] Optimistic updates roll back on error and tell the user.
- [ ] Deep-link and route params are validated before use; a bad param ends on a safe screen.
- [ ] Analytics events carry no PII and have stable names.
- [ ] Lists use stable keys, `getItemType` where types differ, no inline heavy renders, and paginate.
- [ ] `memo`, `useMemo` and `useCallback` appear only where a measurement or a memoized child needs them.
- [ ] Effects clean up (listeners, timers, subscriptions) and do not fire on every render.
- [ ] Offline and slow-network behaviour is defined: queued, blocked with a message, or served from cache.
- [ ] Error messages are user-readable and translated; raw server text is never shown.
- [ ] Tests assert behaviour a user could notice, not implementation details, and fail when the behaviour breaks.
- [ ] Permissions are requested at the moment of need, with a fallback when denied.
- [ ] A new setting, env var or flag has a default, a doc entry and a safe fallback when missing.
- [ ] The diff contains only what the task or spec asks for.
