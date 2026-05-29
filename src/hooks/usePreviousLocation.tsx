import { createContext, useContext, useEffect, useRef, ReactNode } from "react";
import { useLocation } from "react-router-dom";

/**
 * Tracks the previous in-app location across route changes so sub-page forms
 * can "return to origin" on save/cancel instead of jumping to a section default.
 *
 * Usage:
 *   const origin = useOriginPath("/orders");
 *   navigate(origin); // on save or cancel
 *
 * Resolution order for the origin:
 *   1. location.state.origin (explicitly passed by caller)
 *   2. The previous pathname+search recorded by this provider
 *   3. The provided fallback (e.g. "/orders")
 *
 * The origin is captured once on mount of the consumer so navigating around
 * within the form (e.g. editing nested fields) doesn't shift the return target.
 */

const PreviousLocationContext = createContext<{ current: string | null }>({ current: null });

export function PreviousLocationProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const previousRef = useRef<string | null>(null);
  const lastSeenRef = useRef<string>(location.pathname + location.search);

  useEffect(() => {
    const next = location.pathname + location.search;
    if (next !== lastSeenRef.current) {
      previousRef.current = lastSeenRef.current;
      lastSeenRef.current = next;
    }
  }, [location.pathname, location.search]);

  return (
    <PreviousLocationContext.Provider value={previousRef}>
      {children}
    </PreviousLocationContext.Provider>
  );
}

export function usePreviousLocation(): string | null {
  return useContext(PreviousLocationContext).current;
}

/**
 * Resolve and freeze the origin path for the current sub-page on first render.
 * Pass a fallback path (the page's traditional default destination) so behavior
 * is preserved when there's no prior location (e.g. direct link, fresh tab).
 *
 * Self-referential origins (origin === current path) are ignored to avoid loops.
 */
export function useOriginPath(fallback: string): string {
  const location = useLocation();
  const previous = usePreviousLocation();
  const stateOrigin = (location.state as any)?.origin as string | undefined;
  const here = location.pathname + location.search;

  const frozen = useRef<string | null>(null);
  if (frozen.current === null) {
    const candidate = stateOrigin || previous || fallback;
    // Don't return to ourselves; fall back if origin would be the same page.
    frozen.current = candidate && candidate !== here ? candidate : fallback;
  }
  return frozen.current;
}
