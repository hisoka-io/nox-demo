// Name the entry node the worker reports. The worker logs an entry as the
// first 12 characters of its KPS certhash plus "…" (never the IP); the page
// matches that label against the addresses it knows about.

import { DEFAULT_ENTRIES, type KnownEntry } from "./config";

export interface KpsAddressParts {
  host: string;
  port: number;
  certhash: string;
}

/** Split `<ipv4>:<port>:<certhash>` or `[<ipv6>]:<port>:<certhash>`. */
export function parseKpsAddress(address: string): KpsAddressParts | null {
  const m = /^(\[[0-9a-fA-F:.]+\]|[0-9.]+):(\d{1,5}):(u[A-Za-z0-9_-]+)$/.exec(address.trim());
  if (!m) return null;
  const port = Number(m[2]);
  if (port < 1 || port > 65535) return null;
  return { host: m[1], port, certhash: m[3] };
}

export function certhashLabel(certhash: string): string {
  return certhash.length > 12 ? `${certhash.slice(0, 12)}…` : certhash;
}

/** Gateways and bridges named in a worker config, if the config has them. */
export function configEntries(config: unknown): KnownEntry[] {
  if (config === null || typeof config !== "object" || Array.isArray(config)) return [];
  const out: KnownEntry[] = [];
  for (const key of ["bridges", "gateways"] as const) {
    const list = (config as Record<string, unknown>)[key];
    if (!Array.isArray(list)) continue;
    list.forEach((value, i) => {
      if (typeof value === "string" && parseKpsAddress(value)) {
        out.push({ name: `${key === "bridges" ? "bridge" : "gateway"} ${i + 1}`, address: value });
      }
    });
  }
  return out;
}

export interface ResolvedEntry {
  label: string;
  name: string | null;
  address: string | null;
  parts: KpsAddressParts | null;
}

export function resolveEntry(label: string, extra: readonly KnownEntry[] = []): ResolvedEntry {
  const prefix = label.endsWith("…") ? label.slice(0, -1) : label;
  const known = [...extra, ...DEFAULT_ENTRIES].find((entry) => {
    const parts = parseKpsAddress(entry.address);
    return parts !== null && prefix.length > 0 && parts.certhash.startsWith(prefix);
  });
  if (!known) return { label, name: null, address: null, parts: null };
  return { label, name: known.name, address: known.address, parts: parseKpsAddress(known.address) };
}
