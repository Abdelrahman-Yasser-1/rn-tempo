---
status: implemented
owner: rn-tempo
created: 2026-11-02
---

# Items

## Problem

The samples module needs a complete reference feature (list, details, create) that shows the full feature pattern: paginated server data, search, forms, flags and loading, empty and error states.

## User stories

- As a user, I want to browse a long list of items that loads more as I scroll, so that I can find what I need.
- As a user, I want to search items by title, so that I can narrow the list quickly.
- As a user, I want to see an item's image, price and details, so that I can decide about it.
- As a user, I want to add a new item, so that the catalog stays current.
- As a developer, I want a reference feature, so that I can copy its structure for my own features.

## Acceptance criteria

- **AC-1** Given ItemsList, when the user scrolls to the end, then the next page (limit 20) loads.
- **AC-2** Given ItemsList, when pulled to refresh, then the list reloads from the first page.
- **AC-3** Given no results, then an empty state shows; given a failed request, then an error state with Retry shows.
- **AC-4** Given the search field, when the user types, then the server search runs once, 300 ms after typing stops.
- **AC-5** Given a valid ItemCreate form, when submitted, then the item is created and the list is invalidated.
- **AC-6** Given the `itemsCreateEnabled` flag is off, then the create button is hidden and ItemCreate shows an unavailable state.
- **AC-7** Given an item id, when ItemDetails opens, then a shimmer shows, then title, image and formatted price.

## Out of scope

- Editing or deleting items.
- Offline persistence of the list.
- Image upload for new items.

## Open questions

-
