/** Page size of the items list (contract C13). */
export const ITEMS_PAGE_SIZE = 20;

/** Delay between the last keystroke and the server search. */
export const SEARCH_DEBOUNCE_MS = 300;

/** Static pickup slots of the create form; the picker groups them by morning, afternoon and evening. */
export const PICKUP_SLOTS = [
  { value: '09:00' },
  { value: '10:30' },
  { value: '12:00' },
  { value: '14:00' },
  { value: '15:30' },
  { value: '17:00' },
  { value: '18:30' },
] as const;
