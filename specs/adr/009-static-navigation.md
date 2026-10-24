# ADR-009: React Navigation static API

- **Status:** accepted · 2026-10-24

## Decision
Use React Navigation 7's static configuration API, with `if:` groups for the auth gate and automatic deep-link config.

## Why
- Route types and linking come from one definition.
- The auth gate is declarative.
- There's less room for a cheaper implementer model to wire navigation wrongly.
