import { useCallback, useEffect, useRef, useState } from "react";
import { PlacesError, autocomplete, getPlaceDetails, isPlacesAvailable } from "./places-api";
import type { PlaceDetails, PlaceSuggestion } from "./places-parse";

export const SEARCH_UNAVAILABLE_MESSAGE =
  "Address search isn't available in this build. Use your current location or move the pin.";

const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;

// Places billing groups a search into one session: the same token for every keystroke and the
// details call, then a fresh one after a selection. It only needs to be unique, not a real UUID.
function newSessionToken(): string {
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}

function isAbort(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: string }).name === "AbortError";
}

export type PlaceSearch = {
  query: string;
  setQuery: (text: string) => void;
  suggestions: PlaceSuggestion[];
  loading: boolean;
  // True when search can never work in this build (no key, or Google refused the request).
  unavailable: boolean;
  // A transient failure message (network etc.), or null.
  error: string | null;
  noResults: boolean;
  pick: (suggestion: PlaceSuggestion) => Promise<void>;
};

export function usePlaceSearch(onPick: (place: PlaceDetails) => void): PlaceSearch {
  const [query, setQueryState] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(() => !isPlacesAvailable());
  const [error, setError] = useState<string | null>(null);
  const [noResults, setNoResults] = useState(false);

  const token = useRef(newSessionToken());
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const cancelPending = useCallback(() => {
    seq.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    controller.current?.abort();
    controller.current = null;
  }, []);

  useEffect(() => cancelPending, [cancelPending]);

  const run = useCallback(async (text: string) => {
    const mine = ++seq.current;
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    setLoading(true);
    try {
      const result = await autocomplete(text, token.current, ctl.signal);
      if (mine !== seq.current) return; // a newer search replaced this one
      setSuggestions(result);
      setNoResults(result.length === 0);
      setError(null);
    } catch (err) {
      if (isAbort(err) || mine !== seq.current) return;
      setSuggestions([]);
      setNoResults(false);
      if (err instanceof PlacesError && (err.kind === "unavailable" || err.kind === "denied")) {
        setUnavailable(true);
        setError(null);
      } else {
        setError(err instanceof PlacesError ? err.message : "Address search failed. Try again.");
      }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  const setQuery = useCallback(
    (text: string) => {
      setQueryState(text);
      cancelPending();
      setError(null);
      setNoResults(false);
      if (text.trim().length < MIN_CHARS) {
        setSuggestions([]);
        setLoading(false);
        return;
      }
      if (unavailable) return;
      setLoading(true);
      timer.current = setTimeout(() => {
        timer.current = null;
        void run(text.trim());
      }, DEBOUNCE_MS);
    },
    [cancelPending, run, unavailable]
  );

  const pick = useCallback(
    async (suggestion: PlaceSuggestion) => {
      cancelPending();
      const mine = seq.current;
      const ctl = new AbortController();
      controller.current = ctl;
      setLoading(true);
      setError(null);
      try {
        const details = await getPlaceDetails(suggestion.placeId, token.current, ctl.signal);
        if (mine !== seq.current) return;
        token.current = newSessionToken(); // the session ends with a selection
        setQueryState(suggestion.text);
        setSuggestions([]);
        setNoResults(false);
        onPickRef.current(details);
      } catch (err) {
        if (isAbort(err) || mine !== seq.current) return;
        if (err instanceof PlacesError && (err.kind === "unavailable" || err.kind === "denied")) {
          setUnavailable(true);
        } else {
          setError(err instanceof PlacesError ? err.message : "Could not load that address. Try again.");
        }
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [cancelPending]
  );

  return { query, setQuery, suggestions, loading, unavailable, error, noResults, pick };
}
