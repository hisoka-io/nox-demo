import { useState, useEffect, useCallback, useRef } from "react";
import { getClient, disconnectClient, isConnected } from "@/lib/nox";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export function useNoxClient() {
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    isConnected() ? "connected" : "connecting",
  );
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    if (!isConnected()) {
      getClient()
        .then(() => {
          if (!cancelled && mounted.current) setStatus("connected");
        })
        .catch((err) => {
          if (!cancelled && mounted.current) {
            setStatus("error");
            setError(err instanceof Error ? err.message : String(err));
          }
        });
    }

    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, []);

  const reconnect = useCallback(() => {
    disconnectClient();
    setStatus("connecting");
    setError(null);
    getClient()
      .then(() => {
        if (mounted.current) setStatus("connected");
      })
      .catch((err) => {
        if (mounted.current) {
          setStatus("error");
          setError(err instanceof Error ? err.message : String(err));
        }
      });
  }, []);

  return { status, error, reconnect };
}
