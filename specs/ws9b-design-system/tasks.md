# WS9b tasks

Format: `- [ ] T<task id> <summary>`. Tick a box in the same commit that completes the task.
One PR per letter, in order; each PR is device-toured before the next starts.

- [ ] T9b.A Logic → hooks convention (lint warning, generators, migrate 22 screens + OtpInput, Select, TextField, ConnectionModal)
- [ ] T9b.B DGA tokens (SA green, gray, gold, semantic scales) + IBM Plex Sans Arabic
- [ ] T9b.C Icon pipeline: all icons in src, `yarn assets`, `yarn icons:add`, `yarn icons:prune`, Icon rework, generated RTL list
- [ ] T9b.D Component upgrades (Button, TextField family, Toast, Header, Select, Loader, Card, ListItem, EmptyState, Image, BottomSheet, Switch)
- [ ] T9b.E New display/navigation components (Accordion, Tabs, SegmentedControl, Tooltip, Stepper, StepperLayout, FormReview, DescriptionList, Timeline, StatusIndicator, InlineMessage, SectionHeader, Link, Fab, Pagination, PaginatedList, FilterBar, UserCard, AuthLayout, ScreenLayout)
- [ ] T9b.F New inputs + Form* wrappers (NumberInput, Slider, MultiSelect, PhoneInput, CountryPicker, TextArea, all Form*)
- [ ] T9b.G Pickers (DatePickerSheet, TimePickerSheet, MonthYearPicker, TimeSlotPicker) + Hijri recipe
- [ ] T9b.H Optional modules: webview, file-picker, maps
- [ ] T9b.I Hardening (logger redaction, skip401Urls, logical-properties lint, keyboard-controller, feature error boundary, shake debug menu + network logger, vendored AI skills)
- [x] T9b.J Lint & architecture hardening (fixture harness, dependency ownership, size guards, eslint-comments, cheap bans, compose helper, single-source aliases)
- [x] T9b.K Tooling, scripts & DX (node guard, env parity, verify escalation + --pr, test:node, piped lefthook, link check, bundle check, align-deps, AGENTS.md additions, nested AGENTS, guides)
- [x] T9b.L Runtime services & test resilience (integration smoke tests, persist migrations, EnvError, log sinks, storage areas, errors, focus notify, ListLoadingMore, bootstrap graph, link helpers, coverage ratchet, feature READMEs)
- [x] T9b.M push-notifications module, native version sync, Fastlane env badge
- [x] T9b.M2 Firebase per environment (firebase-core module, switchable push), provider-neutral crash reporting, Crashlytics module, Fastlane symbol upload, Sentry recipe
- [x] T9b.N i18n hardening (removeUnusedKeys, Arabic plurals proven, context convention, Intl formatters, no dynamic keys lint, dev missing-key warnings, typed selector)
