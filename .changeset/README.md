# Changesets

Every PR that changes a published package (`packages/*`) adds a changeset:

```sh
yarn changeset
```

Pick the packages and the semver bump, and write a one-line summary. `yarn release` publishes on `main`.
