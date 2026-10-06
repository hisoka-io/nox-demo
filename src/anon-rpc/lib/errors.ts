// Structured worker errors. Hosts branch on `code`, never on message text
// (anon-rpc SPEC §7, §12). The codes are the ones the Nox worker documents.

export interface ErrorView {
  code: string | null;
  name: string;
  message: string;
  hint: string;
}

const FAILED_HINTS: Record<string, string> = {
  "bad-config": "The worker config was rejected; the message names the field. Clear the config box to boot on the built-in anchors.",
  "unsupported-platform": "This browser lacks a capability the worker needs (KPS dialer, WebAssembly or crypto.getRandomValues).",
  "wasm-blocked": "WebAssembly could not start in the sandbox; the page's Content-Security-Policy must allow 'wasm-unsafe-eval'.",
  "snapshot-invalid": "The registry snapshot inside the bundle did not pass its own check; a rebuilt bundle is due.",
  "snapshot-stale": "Nodes agree the registry moved past this bundle's snapshot; a newer bundle is due.",
  "internal-error": "The worker hit an unexpected state; reload the page to start a fresh worker.",
};

const CALL_HINTS: Record<string, string> = {
  cancelled: "The call was cancelled.",
  timeout: "No reply within the call deadline. The mixnet adds per-hop delay; run the call again.",
  "network-error": "No entry accepted the packet, or a redirect was refused. The worker switches entries; run the call again.",
  "too-large": "The request or reply is over the worker's size limit.",
  unsupported: "The request is not an absolute http(s) URL, or uses an unsupported method or header.",
  "protocol-error": "The exit's reply could not be decoded as an HTTP response.",
  "internal-error": "The worker hit an unexpected state.",
};

const PAGE_HINTS: Record<string, string> = {
  "rpc-failed": "The specifier RPC did not answer; check the URL or pick another public RPC.",
  "wrong-chain": "The specifier RPC serves another chain; pick the RPC for the specifier's chain.",
  "not-a-specifier": "That address does not answer workerHash() and workerResolvers() on this chain.",
  "no-bundle": "No resolver served bytes matching the on-chain hash.",
};

export function describeError(error: unknown): ErrorView {
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);
  const rawCode = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  const code = typeof rawCode === "string" && rawCode.length > 0 ? rawCode : null;
  let hint = "";
  if (code !== null) {
    hint =
      (name === "WorkerFailedError" ? FAILED_HINTS[code] : undefined) ??
      CALL_HINTS[code] ??
      FAILED_HINTS[code] ??
      PAGE_HINTS[code] ??
      "";
  } else if (name === "AbortError") {
    hint = CALL_HINTS.cancelled;
  } else if (/worker closed/.test(message)) {
    hint = "The worker was stopped.";
  }
  return { code, name, message, hint };
}

export function hintForFailedCode(code: string | null): string {
  return code === null ? "" : FAILED_HINTS[code] ?? PAGE_HINTS[code] ?? "";
}
