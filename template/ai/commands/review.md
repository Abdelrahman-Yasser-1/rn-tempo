---
description: Review the current branch or a PR against the project checklist
argument-hint: [PR number]
---

Use the `review-pr` skill (the `code-reviewer` agent may be used for a second pass) on: $ARGUMENTS

If no argument is given, review `git diff main...HEAD`.
