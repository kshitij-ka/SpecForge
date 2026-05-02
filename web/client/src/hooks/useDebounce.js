import { useState, useEffect } from "react";

/**
 * Debounces a value to delay updates (e.g., for search input).
 * @param {any} value - The value to debounce.
 * @param {number} delay - Delay in ms (default 300).
 * @returns {any} The debounced value.
 */
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
