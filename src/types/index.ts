export type Tab = "balance" | "tx" | "contract" | "broadcast";

export interface TabConfig {
  id: Tab;
  label: string;
  shortcut: string;
  arbSepoliaOnly?: boolean;
}

export const TABS: TabConfig[] = [
  { id: "balance", label: "Balance", shortcut: "1" },
  { id: "tx", label: "Transaction", shortcut: "2" },
  { id: "contract", label: "Contract", shortcut: "3", arbSepoliaOnly: true },
  { id: "broadcast", label: "Broadcast", shortcut: "4", arbSepoliaOnly: true },
];
