export function formatMs(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function shortHex(value: string, chars = 10): string {
  if (value.length <= chars * 2 + 3) return value;
  return `${value.slice(0, chars + 2)}…${value.slice(-chars)}`;
}

export const inputClass =
  "w-full min-w-0 bg-bg-input border border-fg-faint text-fg text-sm px-3 py-2 outline-none focus:border-accent disabled:opacity-60";
