import { Suspense, lazy } from "react";

// Each page is its own chunk: the anon-rpc page boots the KPS worker from a
// cold start and never loads the Explorer's mixnet client, and the Explorer
// never loads the anon-rpc harness.
const Explorer = lazy(() => import("./App.tsx"));
const AnonRpc = lazy(() => import("./anon-rpc/AnonRpcPage.tsx"));

export default function Root({ anonRpc }: { anonRpc: boolean }) {
  return <Suspense fallback={null}>{anonRpc ? <AnonRpc /> : <Explorer />}</Suspense>;
}
