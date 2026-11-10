// Plain-language platform errors for the two failures a phone can hit before
// any Nox code runs: WebAssembly turned off (Lockdown Mode on Apple devices)
// and a WebRTC dial to the KPS entry that never completes (UDP blocked).

export type PlatformIssueCode = "wasm-disabled" | "no-webrtc" | "webrtc-dial-failed";

export interface PlatformIssue {
  code: PlatformIssueCode;
  title: string;
  hint: string;
}

/** Failed KPS dials in a row, with none done, before the page names the WebRTC dial as the problem. */
export const DIAL_FAILURES_BEFORE_NOTICE = 3;

export interface PlatformEnv {
  WebAssembly?: unknown;
  RTCPeerConnection?: unknown;
}

const ISSUES: Record<PlatformIssueCode, PlatformIssue> = {
  "wasm-disabled": {
    code: "wasm-disabled",
    title: "WebAssembly is disabled in this browser",
    hint:
      "Lockdown Mode on iPhone, iPad and Mac turns WebAssembly off, and Nox needs it for its packet crypto. " +
      "Exclude this site from Lockdown Mode (Safari: the page settings menu, then turn off Lockdown Mode), or try another device.",
  },
  "no-webrtc": {
    code: "no-webrtc",
    title: "This browser has no WebRTC",
    hint: "The page reaches its Nox entry over a WebRTC data channel (KPS). Use a browser with WebRTC turned on.",
  },
  "webrtc-dial-failed": {
    code: "webrtc-dial-failed",
    title: "WebRTC dial failed",
    hint:
      "The browser could not open a WebRTC data channel to any Nox entry. The dial uses UDP to the entry's port; " +
      "some cellular, office and VPN networks drop it. Try another network (for example Wi-Fi instead of cellular) and reload.",
  },
};

export function platformIssue(code: PlatformIssueCode): PlatformIssue {
  return ISSUES[code];
}

/** Missing browser capabilities, checked before booting. */
export function missingCapability(env: PlatformEnv = globalThis as PlatformEnv): PlatformIssue | null {
  if (typeof env.WebAssembly !== "object" || env.WebAssembly === null) return ISSUES["wasm-disabled"];
  if (typeof env.RTCPeerConnection !== "function") return ISSUES["no-webrtc"];
  return null;
}

/** The WebRTC notice once the dial step has failed `DIAL_FAILURES_BEFORE_NOTICE` times without one success. */
export function dialIssue(dialDone: boolean, dialFailures: number): PlatformIssue | null {
  return !dialDone && dialFailures >= DIAL_FAILURES_BEFORE_NOTICE ? ISSUES["webrtc-dial-failed"] : null;
}

/** An Error carrying the issue's title and hint, for paths that surface `error.message`. */
export class PlatformError extends Error {
  readonly code: PlatformIssueCode;
  constructor(issue: PlatformIssue) {
    super(`${issue.title}. ${issue.hint}`);
    this.name = "PlatformError";
    this.code = issue.code;
  }
}
