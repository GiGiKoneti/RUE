import { useEffect } from 'react';
import type { RefObject } from 'react';

export function useResizeObserver(
  ref: RefObject<HTMLElement | null>,
  callback: (entry: ResizeObserverEntry) => void
) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Defer to the next frame so layout/state updates don’t re-enter ResizeObserver
    // in the same tick (avoids "ResizeObserver loop completed with undelivered notifications").
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      requestAnimationFrame(() => {
        callback(entry);
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, callback]);
}
