import { SOKA_TOKEN } from "@/lib/network";

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
}

export const ARB_SEPOLIA_TOKENS: TokenInfo[] = [
  {
    address: SOKA_TOKEN,
    symbol: "SOKA",
    decimals: 18,
  },
];

export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
