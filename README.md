# Nox Demo Example

A private web3 explorer powered by the [Nox mixnet](https://github.com/hisoka-io/nox).
Your queries route through 3 encrypted hops, so no RPC provider sees your IP.

## Features

- Wallet portfolio with ETH and ERC-20 balances
- Transaction lookup and contract reader (ABIs auto-fetched)
- Broadcast pre-signed transactions through the mixnet
- Live visualization of packets routing through the network
- Multichain: Arbitrum Sepolia, Ethereum, Arbitrum, Base, Optimism

The exit node fetches the data; it never sees who asked.

## Development

```bash
pnpm install
pnpm dev
```

## How It Works

```
┌─────────┐   ┌───────┐   ┌─────┐   ┌──────┐   ┌──────────────┐
│ Browser │──▶│ Entry │──▶│ Mix │──▶│ Exit │──▶│ Blockscout / │
└─────────┘   └───────┘   └─────┘   └──────┘   │     RPC      │
     ▲                                         └──────┬───────┘
     └──────────────── SURB return path ──────────────┘
```

`@hisoka-io/nox-client` handles packet construction, 3-hop routing, SURB decryption, and fragment reassembly. Sphinx crypto runs in-browser via WASM.

| Network          | Chain            | Seed                                  |
| ---------------- | ---------------- | ------------------------------------- |
| Live NOX testnet | Arbitrum Sepolia | `https://api.hisoka.io/seed/topology` |

## License

[MIT](./LICENSE)
