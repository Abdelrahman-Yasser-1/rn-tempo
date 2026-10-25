---
name: spec-implement
description: Execute specs/<feature>/tasks.md one task per commit, ticking checkboxes. Use when a spec has a design and tasks and the user asks to implement it.
---

# spec-implement

1. Read `spec.md`, `design.md` and `tasks.md`. Set `status: in-progress` in `spec.md` if it is `approved`.
2. Take the first unchecked task. Work **only** on that task.
3. Generate files with `yarn tempo g ...` when the CLI is installed; otherwise follow `ai/rules/architecture.md`.
4. Write the code and its tests in the same task. Test names start with the AC ID: `it('AC-1: ...')`.
5. Run `yarn verify:changed`. Fix failures at the cause.
6. Tick the task's checkbox in `tasks.md` and commit with the task's commit header (it must satisfy `ai/rules/commits.md`). One task, one commit.
7. Repeat. When every task is checked, run `yarn verify` and `yarn spec:check`, set `status: implemented`, and commit `docs(specs): mark <feature> implemented`.
8. Do not widen scope: new behavior means updating the spec first.
