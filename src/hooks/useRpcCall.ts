import { useCallback, useMemo } from "react";
import { getClient } from "@/lib/nox";
import { usePacketTracker } from "./usePacketTracker";

export interface RpcCallOptions {
  /** RPC endpoint the exit node should query instead of its default (Arb Sepolia). */
  rpcUrl?: string;
  /** Reply budget in bytes; sizes the number of SURBs sent with the request. */
  expectedResponseBytes?: number;
}

/**
 * JSON-RPC through the mixnet. `execute` resolves with the RPC result (which can
 * legitimately be null, e.g. an unknown tx) and rejects on any transport or RPC error.
 */
export function useRpcCall<T = unknown>() {
  const { trackOutbound, trackResponse, trackError } = usePacketTracker();

  const execute = useCallback(
    async (method: string, params: unknown[], opts?: RpcCallOptions): Promise<T> => {
      const start = Date.now();
      trackOutbound(method);

      try {
        const client = await getClient();
        const result = (await client.rpcCall(method, params, opts)) as T;
        trackResponse(method, Date.now() - start);
        return result;
      } catch (err) {
        trackError(method);
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
    [trackOutbound, trackResponse, trackError],
  );

  return useMemo(() => ({ execute }), [execute]);
}
