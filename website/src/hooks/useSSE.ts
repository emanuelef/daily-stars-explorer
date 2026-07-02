import { useCallback, useEffect, useRef } from "react";

// Owns a single EventSource per component instance.
//
// - `open(url)` closes any previous EventSource before opening a new one, so
//   you can't leak by calling it twice in a row.
// - `close()` is idempotent.
// - The EventSource is automatically closed on component unmount — this is the
//   whole point of the hook. Every chart page that opens an SSE for the /sse
//   endpoint used to leak the underlying HTTP/1.1 connection on navigation;
//   after ~6 leaks Chrome's per-origin connection cap was exhausted and every
//   subsequent fetch (even for repos that were already cached server-side)
//   would hang forever. Reaching for `useSSE()` instead of a bare useRef makes
//   the leak structurally impossible.
export function useSSE() {
  const ref = useRef<EventSource | null>(null);

  const close = useCallback(() => {
    if (ref.current) {
      ref.current.close();
      ref.current = null;
    }
  }, []);

  const open = useCallback(
    (url: string): EventSource => {
      close();
      const sse = new EventSource(url);
      ref.current = sse;
      return sse;
    },
    [close],
  );

  useEffect(() => close, [close]);

  return { open, close };
}
