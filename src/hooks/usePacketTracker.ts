import { useCallback, useSyncExternalStore } from "react";

export interface PacketEvent {
  id: number;
  type: "outbound" | "response" | "error";
  method: string;
  timestamp: number;
  latencyMs?: number;
}

interface PacketStore {
  events: PacketEvent[];
  totalSent: number;
  totalReceived: number;
  totalErrors: number;
  avgLatencyMs: number;
}

let store: PacketStore = {
  events: [],
  totalSent: 0,
  totalReceived: 0,
  totalErrors: 0,
  avgLatencyMs: 0,
};

let nextId = 1;
let latencySum = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function pushEvent(event: PacketEvent) {
  store = {
    ...store,
    events: [...store.events.slice(-49), event],
  };

  if (event.type === "outbound") {
    store = { ...store, totalSent: store.totalSent + 1 };
  } else if (event.type === "response") {
    store = { ...store, totalReceived: store.totalReceived + 1 };
    if (event.latencyMs) {
      latencySum += event.latencyMs;
      store = { ...store, avgLatencyMs: Math.round(latencySum / store.totalReceived) };
    }
  } else {
    store = { ...store, totalErrors: store.totalErrors + 1 };
  }

  emit();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot() {
  return store;
}

export function usePacketTracker() {
  const data = useSyncExternalStore(subscribe, getSnapshot);

  const trackOutbound = useCallback((method: string) => {
    pushEvent({ id: nextId++, type: "outbound", method, timestamp: Date.now() });
  }, []);

  const trackResponse = useCallback((method: string, latencyMs: number) => {
    pushEvent({ id: nextId++, type: "response", method, timestamp: Date.now(), latencyMs });
  }, []);

  const trackError = useCallback((method: string) => {
    pushEvent({ id: nextId++, type: "error", method, timestamp: Date.now() });
  }, []);

  return { ...data, trackOutbound, trackResponse, trackError };
}
