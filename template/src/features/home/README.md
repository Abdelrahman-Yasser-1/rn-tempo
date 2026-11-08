# Home

## Purpose

The landing screen of the main tabs. It links to the rest of the app and is the place to put your own dashboard.

## Public API

Everything `index.ts` exports. `yarn lint:readmes` fails when this list and the barrel differ, so update both together.

- `HomeScreen`: The Home tab root screen.

## Screens and routes

Route `Home` of the Home stack (`HomeStackParamList`), under the `HomeTab` tab.

## Data

None. The screen reads no server data and owns no store.

## Spec

[`specs/home/spec.md`](../../../specs/home/spec.md), with its [design](../../../specs/home/design.md) and [tasks](../../../specs/home/tasks.md).
