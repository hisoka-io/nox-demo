# Nox Demo Example

A private web3 explorer powered by the [Nox mixnet](https://github.com/hisoka-io/nox).
Your queries route through 3 encrypted hops, so no RPC provider sees your IP.

## Features

- Wallet portfolio: native balance, transactions sent, and the balances of each chain's main ERC-20 tokens (one Multicall3 read)
- Transaction lookup on every listed chain, and a contract reader (verified ABIs fetched from Sourcify through the mixnet)
- Broadcast pre-signed transactions through the mixnet
- Live view of the network's entry, mix and exit nodes (packet paths in the animation are illustrative)
- Multichain: Arbitrum Sepolia, Ethereum, Arbitrum, Base, Optimism. Every read is a JSON-RPC call made by the exit node: Arbitrum Sepolia through the exit's own provider, the other chains through the public RPC listed in `src/lib/chains.ts`.

The exit node fetches the data; it never sees who asked. Fonts are bundled, and the page makes no direct requests to data providers. The Explorer dials a Nox entry node over KPS (WebRTC with a pinned certificate hash), trusting the registry snapshot pinned in the page (copied from `@hisoka-io/anon-rpc-worker`), and re-checks the registry through the mixnet. Browsers without WebRTC, or a superseded pinned node set, use the HTTPS entry instead, which checks the topology from the Nox seed (`api.hisoka.io`) against the registry over the public Arbitrum Sepolia RPC. The header shows the entry transport in use. The node count in the header comes from the seed's liveness list.

## Anon RPC page (`/anon-rpc`)

`/anon-rpc` runs the Nox worker for the [anon-rpc](https://github.com/ethereum/anon-rpc) standard from a cold browser, next to the Explorer:

1. loads `@anon-rpc/browser-harness` 0.3.2, the reference harness of the anon-rpc standard;
2. reads the worker specifier (`workerHash()`, `workerResolvers()`) through the RPC you choose, downloads the bundle and checks its keccak-256;
3. runs the bundle in the harness's null-origin sandbox; the worker dials a Nox entry node over KPS (WebRTC with a pinned certificate hash);
4. sends wallet calls (`eth_chainId`, `eth_blockNumber`, `eth_getBalance`, an ERC-20 `balanceOf`, a JSON-RPC batch) through `worker.fetch`, each next to the same call made directly, with timings and the transport the call used.

With worker 0.4.0 the calls use end-to-end TLS: the worker runs TLS itself and the exit relays encrypted records, so the request is readable by the RPC provider alone. The page shows the worker's TLS setting (from its `boot.tls` log) and, per call, `end-to-end TLS` or `exit HTTP request`.

The page shows a live boot timeline, the active entry (KPS address and certhash), the bundle hash and specifier with explorer links, the worker's log, and the worker's structured error codes. A developer option boots a local bundle file under the same keccak check. The per-call trace option boots the worker with `logLevel: "debug"` and shows, for each call, whether it used a spare TLS session, opened one inline or retried, with the time spent opening, exchanging and in the page, plus p50/p95 over the calls run.

Configuration (query string first, then build-time variables):

| Query | Build variable | Meaning |
| --- | --- | --- |
| `specifier` | `VITE_ANON_RPC_SPECIFIER` | specifier contract address (default on Ethereum Sepolia: the stable Nox specifier [`0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A`](https://sepolia.etherscan.io/address/0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A), which follows the current worker release, 0.4.0 today: its owner repoints it at each release; the immutable per-release pins boot with `?specifier=`: worker 0.4.0 `0xDf5Db854BA75B52a4bF1a250a93D8d25cB982b2d`, worker 0.3.0 `0x29B51ca9Ad80E9c0B0D111C8748E6a7908b82eDB`, worker 0.2.0 `0x29b4a6A8Cc11769531854d87f9F33EC63Efe8fe6`) |
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
pnpm preview & pnpm smoke              # headless browser smoke test of the built site (all tabs, plus an Ethereum balance and tx)
pnpm smoke https://demo.nox.hisoka.io/ # same, against production
pnpm smoke:anon-rpc [site-url]         # boot /anon-rpc from a cold browser and run the wallet calls
```

`smoke:anon-rpc` also takes `ANON_RPC_SPECIFIER`, `ANON_RPC_CHAIN`, `ANON_RPC_SPECIFIER_RPC`, `ANON_RPC_CONFIG`, `ANON_RPC_BUNDLE` (boot a local bundle file), `ANON_RPC_EXPECT_TRANSPORT` (require `tls-tunnel` or `exit-http` on every call) and `ANON_RPC_REPORT` (write a JSON timing report).

`pnpm smoke` needs a Chromium for Playwright (`pnpm exec playwright install chromium-headless-shell`). It fails if the page contacts a host outside its allowlist.

CI runs lint, build and unit tests, then the smoke test against a local build. `smoke.yml` runs both smoke tests against production after each Railway deployment and every 6 hours, and runs the live mixnet suites on the same schedule.

## How It Works

```
┌─────────┐   ┌───────┐   ┌─────┐   ┌──────┐   ┌──────────────┐
│ Browser │──▶│ Entry │──▶│ Mix │──▶│ Exit │──▶│  RPC /       │
└─────────┘   └───────┘   └─────┘   └──────┘   │  Sourcify    │
     ▲                                         └──────┬───────┘
     └──────────────── SURB return path ──────────────┘
```

`@hisoka-io/nox-client` handles packet construction, 3-hop routing, SURB decryption, and fragment reassembly. Sphinx crypto runs in-browser via WASM.

| Network          | Chain            | Seed                                  |
| ---------------- | ---------------- | ------------------------------------- |
| Live NOX testnet | Arbitrum Sepolia | `https://api.hisoka.io/seed/topology` |

## License

[MIT](./LICENSE)
