// Pure helper for picking a Google Maps class. No imports so node's test runner
// can load this file directly. Prefers the class from the imported library and
// falls back to the global google.maps.<Class>; throws a clear error otherwise
// so callers can show their fallback instead of "x is not a constructor".
export function pickClass<T>(name: string, fromLibrary: unknown, fromGlobal: unknown): T {
  if (typeof fromLibrary === "function") return fromLibrary as T;
  if (typeof fromGlobal === "function") return fromGlobal as T;
  throw new Error(`Google Maps class ${name} is not available`);
}

// Loader rules, kept pure so they can be tested.
export type LoadFailureKind = "load_failed" | "auth_failed";

// A rejected key (gm_authFailure) wins over a generic load failure.
export function failureKind(authFailed: boolean): LoadFailureKind {
  return authFailed ? "auth_failed" : "load_failed";
}

// Only a transient load failure may be retried; a missing or rejected key cannot recover.
export function isRetryable(kind: string): boolean {
  return kind === "load_failed";
}

// What a (re)try should do about the bootstrap script: a Maps API that already
// exists is used as is, a script still in the page (for example one that timed
// out but may still finish) is waited on again, and only otherwise is one
// injected, so the API script is never added twice.
export function bootstrapAction(
  apiReady: boolean,
  scriptPresent: boolean
): "resolve" | "reuse" | "inject" {
  if (apiReady) return "resolve";
  return scriptPresent ? "reuse" : "inject";
}
