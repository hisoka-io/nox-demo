# Nox Demo Example

A private web3 explorer powered by the [Nox mixnet](https://github.com/hisoka-io/nox).
Your queries route through 3 encrypted hops, so no RPC provider sees your IP.

## Features

- Wallet portfolio with ETH and ERC-20 balances
- Transaction lookup and contract reader (ABIs fetched from Blockscout through the mixnet)
- Broadcast pre-signed transactions through the mixnet
- Live view of the network's entry, mix and exit nodes (packet paths in the animation are illustrative)
- Multichain: Arbitrum Sepolia, Ethereum, Arbitrum, Base, Optimism. RPC mode reads Arbitrum Sepolia, the exit nodes' default chain; other chains use Explorer mode (Blockscout).

The exit node fetches the data; it never sees who asked. Fonts are bundled, and the page makes no direct requests to data providers. It does talk to the Nox seed (`api.hisoka.io`), one Nox entry node, and the public Arbitrum Sepolia RPC, which the SDK uses to check the topology against the on-chain registry.

## Development

```bash
pnpm install
pnpm dev
```

## Testing

```bash
pnpm lint && pnpm build && pnpm test   # offline unit tests (what CI runs)
pnpm test:live                         # mixnet suites against the live testnet (~4 min)
pnpm preview & pnpm smoke              # headless browser smoke test of the built site
pnpm smoke https://demo.nox.hisoka.io/ # same, against production
```

`pnpm smoke` needs a Chromium for Playwright (`pnpm exec playwright install chromium-headless-shell`). It fails if the page contacts a host outside its allowlist.

CI runs lint, build and unit tests, then the smoke test against a local build. `smoke.yml` runs the smoke test against production after each Railway deployment and every 6 hours, and runs the live mixnet suites on the same schedule.

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
