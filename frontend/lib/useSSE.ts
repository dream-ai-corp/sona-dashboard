'use client';
import { useEffect, useRef } from 'react';

/**
 * Subscribe to an SSE endpoint. Calls onMessage with each parsed JSON payload.
 * Auto-reconnects after 3s on error. Cleans up on unmount.
 */
export function useSSE<T>(url: string, onMessage: (data: T) => void) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    const connect = () => {
      if (!active) return;
      es = new EventSource(url);
      es.onmessage = (e) => {
        try { onMessageRef.current(JSON.parse(e.data)); } catch { /* ignore */ }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (active) retryTimer = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      active = false;
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
}
