import { useState, useCallback } from "react";
import { getClient } from "@/lib/nox";
import { decodeHttpResponseJson } from "@/lib/http-response";
import { usePacketTracker } from "./usePacketTracker";

interface HttpCallState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  latency: number | null;
}

export function useHttpCall<T = unknown>() {
  const [state, setState] = useState<HttpCallState<T>>({
    data: null,
    loading: false,
    error: null,
    latency: null,
  });

  const { trackOutbound, trackResponse, trackError } = usePacketTracker();

  const execute = useCallback(
    async (url: string, expectedBytes = 50_000): Promise<T | null> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const start = Date.now();
      const label = new URL(url).pathname.split("/").slice(-2).join("/");
      trackOutbound(`http:${label}`);

      try {
        const client = await getClient();
        const raw = await client.httpRequest(
          "GET",
          url,
          [["Accept", "application/json"]],
          new Uint8Array(0),
          { expectedResponseBytes: expectedBytes },
        );

        const elapsed = Date.now() - start;
        trackResponse(`http:${label}`, elapsed);

        const parsed = decodeHttpResponseJson<T>(raw);
        setState({ data: parsed, loading: false, error: null, latency: elapsed });
        return parsed;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        trackError(`http:${label}`);
        setState((prev) => ({ ...prev, loading: false, error: msg }));
        return null;
      }
    },
    [trackOutbound, trackResponse, trackError],
  );

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null, latency: null });
  }, []);

  return { ...state, execute, reset };
}
