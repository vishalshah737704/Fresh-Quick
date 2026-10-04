// Pure helper for picking a Google Maps class. No imports so node's test runner
// can load this file directly. Prefers the class from the imported library and
// falls back to the global google.maps.<Class>; throws a clear error otherwise
// so callers can show their fallback instead of "x is not a constructor".
export function pickClass<T>(name: string, fromLibrary: unknown, fromGlobal: unknown): T {
  if (typeof fromLibrary === "function") return fromLibrary as T;
  if (typeof fromGlobal === "function") return fromGlobal as T;
  throw new Error(`Google Maps class ${name} is not available`);
}
