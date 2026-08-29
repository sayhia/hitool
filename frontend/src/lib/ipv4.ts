export type CidrInfo = {
  ip: string;
  prefix: number;
  mask: string;
  network: string;
  broadcast: string;
  first: string;
  last: string;
  hosts: number;
  wildcard: string;
};

export function parseIPv4(s: string): number | null {
  const parts = s.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v < 0 || v > 255) return null;
    n = ((n << 8) + v) >>> 0;
  }
  return n;
}

export function formatIPv4(n: number): string {
  const x = n >>> 0;
  return `${(x >>> 24) & 255}.${(x >>> 16) & 255}.${(x >>> 8) & 255}.${x & 255}`;
}

export function parseCIDR(input: string): CidrInfo | null {
  const raw = input.trim();
  const slash = raw.indexOf("/");
  const ipStr = slash >= 0 ? raw.slice(0, slash) : raw;
  const prefix = slash >= 0 ? Number(raw.slice(slash + 1)) : 32;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const ip = parseIPv4(ipStr);
  if (ip === null) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const size = 2 ** (32 - prefix);
  const hosts = prefix >= 31 ? size : Math.max(0, size - 2);
  const first = prefix >= 31 ? network : (network + 1) >>> 0;
  const last = prefix >= 31 ? broadcast : (broadcast - 1) >>> 0;
  return {
    ip: formatIPv4(ip),
    prefix,
    mask: formatIPv4(mask),
    network: formatIPv4(network),
    broadcast: formatIPv4(broadcast),
    first: formatIPv4(first),
    last: formatIPv4(last),
    hosts,
    wildcard: formatIPv4((~mask) >>> 0),
  };
}
