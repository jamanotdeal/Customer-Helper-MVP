/**
 * Safely checks whether an unknown value contains a lowercased search query.
 * Handles null, undefined, and non-string values (e.g., numbers) without throwing.
 */
export function matchesQuery(value: unknown, lowerQuery: string): boolean {
  if (value == null) return false;
  return String(value).toLowerCase().includes(lowerQuery);
}

/**
 * Safely checks whether any value in the provided list contains the lowercased search query.
 */
export function matchesAnyField(values: unknown[], lowerQuery: string): boolean {
  return values.some((v) => matchesQuery(v, lowerQuery));
}
