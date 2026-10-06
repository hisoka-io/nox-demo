/** Path of the anon-rpc page; the Explorer serves every other path. */
export const ANON_RPC_PATH = "/anon-rpc";

export function isAnonRpcPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized === ANON_RPC_PATH || normalized.startsWith(`${ANON_RPC_PATH}/`);
}
