import { describe, it, expect } from "vitest";
import {
  DIAL_FAILURES_BEFORE_NOTICE,
  dialIssue,
  missingCapability,
  PlatformError,
  platformIssue,
} from "@/lib/platform";

class FakePeerConnection {}

describe("platform errors", () => {
  it("names Lockdown Mode when WebAssembly is missing", () => {
    const issue = missingCapability({ RTCPeerConnection: FakePeerConnection });
    expect(issue?.code).toBe("wasm-disabled");
    expect(issue?.hint).toMatch(/Lockdown Mode/);
  });

  it("names WebRTC when RTCPeerConnection is missing", () => {
    expect(missingCapability({ WebAssembly: {} })?.code).toBe("no-webrtc");
  });

  it("reports nothing when both are present", () => {
    expect(missingCapability({ WebAssembly: {}, RTCPeerConnection: FakePeerConnection })).toBeNull();
  });

  it("names the WebRTC dial only after repeated failures and no success", () => {
    expect(dialIssue(false, DIAL_FAILURES_BEFORE_NOTICE - 1)).toBeNull();
    expect(dialIssue(false, DIAL_FAILURES_BEFORE_NOTICE)?.code).toBe("webrtc-dial-failed");
    expect(dialIssue(true, DIAL_FAILURES_BEFORE_NOTICE + 5)).toBeNull();
  });

  it("carries the title and hint in a PlatformError", () => {
    const error = new PlatformError(platformIssue("wasm-disabled"));
    expect(error.code).toBe("wasm-disabled");
    expect(error.message).toContain("WebAssembly is disabled in this browser");
  });
});
