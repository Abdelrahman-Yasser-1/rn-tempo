# Specs

Features are specified before they are built. One folder per feature:

```
specs/
  README.md   product.md   tech.md
  _templates/{spec,design,tasks}.md
  <feature-kebab>/{spec.md, design.md, tasks.md}
```

- [`product.md`](product.md): vision, personas, glossary, non-functional requirements.
- [`tech.md`](tech.md): deviations from the template (link ADRs), integrations, environments, API source.
- `<feature>/spec.md`: what and why. Frontmatter `status`, `owner`, `created`; sections Problem, User stories, Acceptance criteria, Out of scope, Open questions.
- `<feature>/design.md`: how. Screens and navigation, Data/API (Zod DTOs), State, Flags, i18n namespaces, a11y, Analytics, Risks.
- `<feature>/tasks.md`: the ordered checklist, one commit per task.

## Lifecycle

| Status        | Meaning                                  | Who moves it         |
| ------------- | ---------------------------------------- | -------------------- |
| `draft`       | Being written, open questions allowed    | Author (human or AI) |
| `approved`    | Scope agreed; planning may start         | **A human**          |
| `in-progress` | `design.md` and `tasks.md` exist; coding | Implementer          |
| `implemented` | Every task is done                       | Implementer          |
| `verified`    | QA or E2E confirmed the behavior         | A human / CI         |

With AI: `/spec` (skill `spec-new`) writes the draft, `/plan` (`spec-plan`) writes design and tasks, `/implement` (`spec-implement`) does one task per commit and ticks its checkbox in the same commit.

## Formats

Acceptance criteria. IDs are unique within the feature and never renumbered; a removed AC is struck through.

```
- **AC-1** Given <context>, when <action>, then <outcome>.
```

Tasks:

```
- [ ] T1 (AC-1, AC-2) <imperative summary> — commit: feat(<scope>): <subject>
```

## Linking tests

- Jest: the test name starts with the AC ID, `it('AC-1: navigates to Home after valid login', ...)`, in a test under `src/features/<feature>/`.
- Maestro: the flow lists the AC IDs in `tags:`.
- `yarn spec:check` fails when an AC of a spec with status `implemented` or `verified` has no linked test. Specs in other statuses are reported but do not fail; use `--strict` to enforce every status.

## New feature

`yarn tempo g feature <name>` creates the folder from `_templates/`. Without the CLI, copy the three files from `_templates/` into `specs/<name>/`.
