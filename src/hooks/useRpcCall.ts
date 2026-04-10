import { useState, useCallback } from "react";
import { getClient } from "@/lib/nox";
import { usePacketTracker } from "./usePacketTracker";

interface RpcCallState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  latency: number | null;
}

export function useRpcCall<T = unknown>() {
  const [state, setState] = useState<RpcCallState<T>>({
    data: null,
    loading: false,
    error: null,
    latency: null,
  });

  const { trackOutbound, trackResponse, trackError } = usePacketTracker();

  const execute = useCallback(
    async (method: string, params: unknown[]): Promise<T | null> => {
      setState({ data: null, loading: true, error: null, latency: null });
      const start = Date.now();
      trackOutbound(method);

      try {
        const client = await getClient();
        const result = (await client.rpcCall(method, params)) as T;
        const elapsed = Date.now() - start;
        trackResponse(method, elapsed);
        setState({ data: result, loading: false, error: null, latency: elapsed });
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        trackError(method);
        setState({ data: null, loading: false, error: msg, latency: null });
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
