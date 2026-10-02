import { useCallback, useMemo } from "react";
import { getClient } from "@/lib/nox";
import { decodeHttpResponseJson } from "@/lib/http-response";
import { usePacketTracker } from "./usePacketTracker";

export const DEFAULT_HTTP_BUDGET = 50_000;

/**
 * HTTP GET through the mixnet, decoded as JSON. `execute` rejects on transport
 * errors, non-2xx statuses and truncated replies, so callers can show the failure.
 */
export function useHttpCall<T = unknown>() {
  const { trackOutbound, trackResponse, trackError } = usePacketTracker();

  const execute = useCallback(
    async (url: string, expectedBytes = DEFAULT_HTTP_BUDGET, timeoutMs?: number): Promise<T> => {
      const start = Date.now();
      const label = `http:${new URL(url).pathname.split("/").slice(-2).join("/")}`;
      trackOutbound(label);

      let raw: Uint8Array;
      try {
        const client = await getClient();
        raw = await client.httpRequest(
          "GET",
          url,
          [["Accept", "application/json"]],
          new Uint8Array(0),
          { expectedResponseBytes: expectedBytes, timeoutMs },
        );
        trackResponse(label, Date.now() - start);
      } catch (err) {
        trackError(label);
        throw err instanceof Error ? err : new Error(String(err));
      }
      // The reply arrived; a bad status or truncated body is an application error.
      return decodeHttpResponseJson<T>(raw);
    },
    [trackOutbound, trackResponse, trackError],
  );

  return useMemo(() => ({ execute }), [execute]);
}
