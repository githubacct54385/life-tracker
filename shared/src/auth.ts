// Shared by the browser (sends the header) and the API (requires it). ADR-0006.

/** Every non-GET request carries this header. A cross-site form or link cannot add a custom header. */
export const REQUEST_GUARD_HEADER = "x-life-tracker";
export const REQUEST_GUARD_VALUE = "1";
