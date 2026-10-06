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

## Anon RPC page (`/anon-rpc`)

`/anon-rpc` runs the Nox worker for the [anon-rpc](https://github.com/ethereum/anon-rpc) standard from a cold browser, next to the Explorer:

1. loads `@anon-rpc/browser-harness` 0.3.2, the version the reference anon-rpc demo pins;
2. reads the worker specifier (`workerHash()`, `workerResolvers()`) through the RPC you choose, downloads the bundle and checks its keccak-256;
3. runs the bundle in the harness's null-origin sandbox; the worker dials a Nox entry node over KPS (WebRTC with a pinned certificate hash);
4. sends wallet calls (`eth_chainId`, `eth_blockNumber`, `eth_getBalance`, an ERC-20 `balanceOf`, a JSON-RPC batch) through `worker.fetch`, each next to the same call made directly, with timings.

The page shows a live boot timeline, the active entry (KPS address and certhash), the bundle hash and specifier with explorer links, the worker's log, and the worker's structured error codes. A developer option boots a local bundle file under the same keccak check.

Configuration (query string first, then build-time variables):

| Query | Build variable | Meaning |
| --- | --- | --- |
| `specifier` | `VITE_ANON_RPC_SPECIFIER` | specifier contract address |
| `chain` | `VITE_ANON_RPC_CHAIN_ID` | chain id of the specifier (default 11155111) |
| `rpc` | `VITE_ANON_RPC_SPECIFIER_RPC` | RPC for the specifier read (default: the chain's public RPC) |
| `target` | `VITE_ANON_RPC_TARGET` | chain for the wallet calls: `arbitrum-sepolia`, `ethereum`, `ethereum-sepolia` |

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
pnpm smoke:anon-rpc [site-url]         # boot /anon-rpc from a cold browser and run the wallet calls
```

`smoke:anon-rpc` also takes `ANON_RPC_SPECIFIER`, `ANON_RPC_CHAIN`, `ANON_RPC_SPECIFIER_RPC`, `ANON_RPC_CONFIG`, `ANON_RPC_BUNDLE` (boot a local bundle file) and `ANON_RPC_REPORT` (write a JSON timing report).

`pnpm smoke` needs a Chromium for Playwright (`pnpm exec playwright install chromium-headless-shell`). It fails if the page contacts a host outside its allowlist.

CI runs lint, build and unit tests, then the smoke test against a local build. `smoke.yml` runs both smoke tests against production after each Railway deployment and every 6 hours, and runs the live mixnet suites on the same schedule.

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
