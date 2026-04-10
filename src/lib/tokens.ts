export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
}

export const ARB_SEPOLIA_TOKENS: TokenInfo[] = [
  {
    address: "0x208be235AAB9b8b5d86285b2684c8e6743e662b5",
    symbol: "NOX-STK",
    decimals: 18,
  },
];

export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
