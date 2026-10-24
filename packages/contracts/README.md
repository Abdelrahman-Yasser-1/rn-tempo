# @rn-tempo/contracts

Shared contracts between the RN-TEMPO template, the `tempo` CLI and CI.

- `schemas/feature-manifest.schema.json`: optional template modules (`.tempo/features/<name>.json`)
- `schemas/tempo.schema.json`: project metadata (`.tempo.json`)
- `schemas/ai-session.schema.json`: AI session log frontmatter (`.ai/sessions/*.md`)
- `markers.mjs`: feature-marker syntax (`// @tempo-feature:<name>:start|end`), plus `scanMarkers`, `validateMarkers` and `stripFeature`

Changing a contract affects every workstream. Changes need an ADR and the integrator's review.
