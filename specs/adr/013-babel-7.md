# ADR-013: Stay on Babel 7

- **Status:** accepted · 2026-10-24 · revisit with RN's next babel-preset

## Context
Babel 8 is released, but `@react-native/babel-preset@0.88` depends on `@babel/core ^7.25.2`.

## Decision
Pin the latest Babel 7.x (7.29.x) for `@babel/core`, `@babel/preset-env` and `@babel/runtime`.
