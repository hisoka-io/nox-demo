import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AnonRpcWorker } from "@anon-rpc/browser-harness";
import type { Hex } from "viem";
import { bundleHash, fetchVerifiedBundle, formatBytes, type ResolverOutcome } from "./lib/bundle";
import { localSpecifierAddress, memoryProvider, readSpecifier, hostOf } from "./lib/specifier";
import { bootReducer, initialBootState, parseWorkerLog, requestTiming, type LogLevel, type RequestTiming } from "./lib/timeline";

export type BootSource =
  | { kind: "specifier"; address: string; chainId: number; rpcUrl: string }
  | { kind: "file"; name: string; bytes: Uint8Array };

export interface BootRequest {
  source: BootSource;
  config: unknown;
}

export interface BootInfo {
  specifier: string;
  chainId: number | null;
  fileName: string | null;
  workerHash: Hex;
  resolvers: string[];
  resolverUsed: string | null;
  bundleBytes: number | null;
  outcomes: ResolverOutcome[];
}

export interface LogLine {
  id: number;
  at: number;
  source: "page" | "worker";
  level: LogLevel;
  text: string;
}

export type Phase = "idle" | "booting" | "ready" | "failed";

/** Rows kept for the log drawer (the harness keeps its own bounded queue). */
const LOG_ROWS = 500;

/** `request.timing` entries kept for matching to calls. */
const TIMINGS_KEPT = 64;

class PageBootError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PageBootError";
    this.code = code;
  }
}

function errorCode(error: unknown): string | null {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && code.length > 0 ? code : null;
}

export function useAnonRpcWorker() {
  const [boot, dispatch] = useReducer(bootReducer, undefined, () => initialBootState(0));
  const [phase, setPhase] = useState<Phase>("idle");
  const [info, setInfo] = useState<BootInfo | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [worker, setWorker] = useState<AnonRpcWorker | null>(null);
  const workerRef = useRef<AnonRpcWorker | null>(null);
  const blobRef = useRef<string | null>(null);
  const runRef = useRef(0);
  const logIdRef = useRef(0);
  const timingsRef = useRef<RequestTiming[]>([]);

  /**
   * The last request timing the worker logged at or after `since` and no
   * later than `until` (the page runs one call at a time, so that is the
   * call's winning request). Null when the worker logged none (worker 0.2.0,
   * or a logLevel above debug).
   */
  const timingBetween = useCallback((since: number, until: number): RequestTiming | null => {
    const found = timingsRef.current.filter((timing) => timing.at >= since && timing.at <= until);
    return found.length === 0 ? null : found[found.length - 1]!;
  }, []);
  const pushLog = useCallback((source: LogLine["source"], level: LogLevel, text: string) => {
    const line: LogLine = { id: ++logIdRef.current, at: performance.now(), source, level, text };
    setLogs((prev) => (prev.length >= LOG_ROWS ? [...prev.slice(prev.length - LOG_ROWS + 1), line] : [...prev, line]));
  }, []);

  const teardown = useCallback(() => {
    workerRef.current?.close();
    workerRef.current = null;
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    blobRef.current = null;
  }, []);

  const stop = useCallback(() => {
    runRef.current += 1;
    const had = workerRef.current !== null;
    teardown();
    setWorker(null);
    setPhase("idle");
    if (had) pushLog("page", "info", "worker stopped and closed");
  }, [pushLog, teardown]);

  const start = useCallback(
    async (request: BootRequest) => {
      teardown();
      const run = ++runRef.current;
      const alive = () => runRef.current === run;
      const t0 = performance.now();
      dispatch({ type: "reset", at: t0 });
      setPhase("booting");
      setInfo(null);
      setWorker(null);
      setLogs([]);
      timingsRef.current = [];
      const now = () => performance.now();

      try {
        let address: string;
        let workerHash: Hex;
        let resolvers: string[];
        let bytes: Uint8Array | null;
        let resolverUsed: string | null = null;
        let outcomes: ResolverOutcome[] = [];
        let chainId: number | null = null;
        let fileName: string | null = null;

        if (request.source.kind === "file") {
          fileName = request.source.name;
          bytes = request.source.bytes;
          workerHash = bundleHash(bytes);
          address = localSpecifierAddress(workerHash);
          resolvers = [];
          dispatch({ type: "step", id: "specifier", status: "skipped", at: now(), detail: "bundle loaded from a file; the page pins its hash" });
          dispatch({ type: "step", id: "bundle", status: "done", at: now(), detail: `${fileName}, ${formatBytes(bytes.byteLength)}, keccak computed locally` });
          pushLog("page", "info", `loaded ${fileName} (${bytes.byteLength} bytes), keccak ${workerHash}`);
        } else {
          const src = request.source;
          chainId = src.chainId;
          dispatch({ type: "step", id: "specifier", status: "active", at: now(), detail: `eth_call workerHash() + workerResolvers() via ${hostOf(src.rpcUrl)}` });
          pushLog("page", "info", `reading specifier ${src.address} on chain ${src.chainId} via ${hostOf(src.rpcUrl)}`);
          const read = await readSpecifier(fetch.bind(window), src.rpcUrl, src.address, src.chainId);
          if (!alive()) return;
          address = read.address;
          workerHash = read.workerHash;
          resolvers = read.resolvers;
          dispatch({ type: "step", id: "specifier", status: "done", at: now(), detail: `${resolvers.length} resolver(s), read in ${read.ms} ms` });
          pushLog("page", "info", `workerHash ${workerHash}, resolvers: ${resolvers.join(", ") || "none"}`);
          setInfo({ specifier: address, chainId, fileName, workerHash, resolvers, resolverUsed: null, bundleBytes: null, outcomes: [] });

          dispatch({ type: "step", id: "bundle", status: "active", at: now(), detail: "fetching from the first http(s) resolver" });
          const fetched = await fetchVerifiedBundle(fetch.bind(window), resolvers, workerHash);
          if (!alive()) return;
          outcomes = fetched.outcomes;
          bytes = fetched.bytes;
          resolverUsed = fetched.resolver;
          for (const o of outcomes) {
            if (o.kind === "failed") pushLog("page", "warn", `resolver ${o.resolver}: ${o.reason}`);
            if (o.kind === "mismatch") pushLog("page", "warn", `resolver ${o.resolver}: hash mismatch (got ${o.got})`);
          }
          if (bytes !== null && resolverUsed !== null) {
            dispatch({
              type: "step",
              id: "bundle",
              status: "done",
              at: now(),
              detail: `${formatBytes(bytes.byteLength)} from ${hostOf(resolverUsed)} in ${fetched.ms} ms, keccak matches`,
            });
            pushLog("page", "info", `bundle ${bytes.byteLength} bytes from ${resolverUsed}, keccak matches the specifier`);
          } else if (outcomes.some((o) => o.kind === "harness")) {
            dispatch({ type: "step", id: "bundle", status: "active", at: now(), detail: "the harness fetches the kps: resolver over KPS and checks keccak" });
          } else {
            throw new PageBootError("no-bundle", "No resolver served bytes matching the on-chain worker hash");
          }
        }

        let harnessResolvers = resolvers;
        if (bytes !== null) {
          // SPEC §4.1 lists blob: for bytes the host already holds; the harness
          // fetches it in this page and checks keccak against the same hash.
          const blobUrl = URL.createObjectURL(new Blob([bytes as BufferSource], { type: "text/javascript" }));
          blobRef.current = blobUrl;
          harnessResolvers = [blobUrl, ...resolvers];
        }
        setInfo({
          specifier: address,
          chainId,
          fileName,
          workerHash,
          resolvers,
          resolverUsed,
          bundleBytes: bytes?.byteLength ?? null,
          outcomes,
        });

        dispatch({ type: "step", id: "sandbox", status: "active", at: now(), detail: "harness re-checks keccak, then runs the bundle in a null-origin iframe" });
        const w = new AnonRpcWorker({
          address,
          config: request.config,
          preExisting: { rpcProvider: memoryProvider(address, workerHash, harnessResolvers) },
        });
        workerRef.current = w;
        setWorker(w);

        void (async () => {
          for (;;) {
            let entry;
            try {
              entry = await w.acceptLog();
            } catch {
              return;
            }
            if (workerRef.current !== w) return;
            const log = parseWorkerLog(entry);
            const at = performance.now();
            const timing = requestTiming(log, at);
            if (timing !== null) {
              timingsRef.current = [...timingsRef.current.slice(-(TIMINGS_KEPT - 1)), timing];
            }
            dispatch({ type: "log", at, log });
            pushLog("worker", log.level, log.text);
          }
        })();

        await w.ready;
        if (!alive()) return;
        dispatch({ type: "ready", at: now() });
        setPhase("ready");
        pushLog("page", "info", `worker ready in ${Math.round(now() - t0)} ms`);
      } catch (error) {
        if (!alive()) return;
        const message = error instanceof Error ? error.message : String(error);
        dispatch({ type: "failed", at: now(), code: errorCode(error), message });
        setPhase("failed");
        pushLog("page", "error", `boot failed${errorCode(error) ? ` (${errorCode(error)})` : ""}: ${message}`);
      }
    },
    [pushLog, teardown],
  );

  useEffect(() => () => {
    runRef.current += 1;
    teardown();
  }, [teardown]);

  const effectivePhase: Phase = phase === "ready" && boot.failure !== null ? "failed" : phase;

  return { phase: effectivePhase, boot, info, logs, worker, start, stop, pushLog, timingBetween };
}
