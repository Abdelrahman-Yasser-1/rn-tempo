# ADR-004: TypeScript 6.0, not 7

- **Status:** accepted · 2026-10-24 · revisit when typescript-eslint supports TS 7

## Context
TypeScript 7.0.2 (the native Go port) is out, but `typescript-eslint@8.72` declares a peer dependency of `typescript >=4.8.4 <6.1.0`. Type-aware lint rules are central to our standards.

## Decision
Pin the latest TypeScript 6.0.x (6.0.3).

## Consequences
We miss TS 7's speed for now. Renovate shows the TS 7 upgrade once typescript-eslint supports it.
