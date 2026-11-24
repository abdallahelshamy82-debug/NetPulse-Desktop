import dns from "dns";
import net from "net";
import { performance } from "perf_hooks";
import type { ProbeVantage } from "@/types/telemetry";

export type NetworkGuardErrorCode =
  | "SSRF_BLOCKED"
  | "DNS_FAILED"
  | "DNS_TIMEOUT"
  | "INVALID_PROTOCOL";

export class NetworkGuardError extends Error {
  public readonly statusCode: number;
  public readonly code: NetworkGuardErrorCode;

  constructor(message: string, statusCode: number, code: NetworkGuardErrorCode) {
    super(message);
    this.name = "NetworkGuardError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isCloudEnvironment(): boolean {
  return process.env.VERCEL === "1" || process.env.NETPULSE_CLOUD_MODE === "1";
}

export function getProbeVantage(): ProbeVantage {
  if (isCloudEnvironment()) {
    const region = process.env.VERCEL_REGION?.trim().toUpperCase() || "CLOUD";
    return { mode: "cloud", region };
  }
  return { mode: "local", region: null };
}

export function isPrivateTargetsAllowed(): boolean {
  if (isCloudEnvironment()) return false;
  return (
    process.env.ELECTRON_RUN_AS_NODE === "1" ||
    process.env.NETPULSE_DESKTOP_MODE === "1" ||
    process.env.NETPULSE_ALLOW_PRIVATE === "1"
  );
}

function isPrivateIpv4Octets(a: number, b: number, c: number): boolean {
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // 127.0.0.0/8 (Loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (Link-Local / Cloud Metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC 1918)
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC 1918)
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 (TEST-NET-2)
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 (TEST-NET-3)
  if (a >= 224) return true; // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved/Broadcast)
  return false;
}

function parseIpv4Octets(ip: string): [number, number, number, number] | null {
  if (!net.isIPv4(ip)) return null;
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return [nums[0], nums[1], nums[2], nums[3]];
}

function isPrivateIpv4(ip: string): boolean {
  const octets = parseIpv4Octets(ip);
  if (!octets) return true;
  return isPrivateIpv4Octets(octets[0], octets[1], octets[2]);
}

function expandIpv6(ip: string): number[] | null {
  let raw = ip.toLowerCase();
  const lastColon = raw.lastIndexOf(":");
  if (lastColon !== -1 && raw.includes(".")) {
    const tail = raw.slice(lastColon + 1);
    const octets = parseIpv4Octets(tail);
    if (!octets) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    raw = `${raw.slice(0, lastColon)}:${hi}:${lo}`;
  }

  const doubleColonParts = raw.split("::");
  if (doubleColonParts.length > 2) return null;

  let groups: string[];
  if (doubleColonParts.length === 2) {
    const left = doubleColonParts[0] ? doubleColonParts[0].split(":") : [];
    const right = doubleColonParts[1] ? doubleColonParts[1].split(":") : [];
    const missing = 8 - (left.length + right.length);
    if (missing < 1) return null;
    groups = [...left, ...Array<string>(missing).fill("0"), ...right];
  } else {
    groups = raw.split(":");
  }

  if (groups.length !== 8) return null;

  const parsed: number[] = [];
  for (const grp of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(grp)) return null;
    parsed.push(parseInt(grp, 16));
  }
  return parsed;
}

function isPrivateIpv6(ip: string): boolean {
  const g = expandIpv6(ip);
  if (!g) return true;

  // :: (unspecified)
  if (g.every((v) => v === 0)) return true;

  // ::1 (loopback)
  if (g.slice(0, 7).every((v) => v === 0) && g[7] === 1) return true;

  // ::ffff:0:0/96 (IPv4-mapped IPv6)
  if (g.slice(0, 5).every((v) => v === 0) && g[5] === 0xffff) {
    return isPrivateIpv4Octets((g[6] >> 8) & 0xff, g[6] & 0xff, (g[7] >> 8) & 0xff);
  }

  // ::/96 (deprecated IPv4-compatible IPv6)
  if (g.slice(0, 6).every((v) => v === 0) && (g[6] !== 0 || g[7] > 1)) {
    return true;
  }

  // 64:ff9b::/96 (NAT64)
  if (
    g[0] === 0x0064 &&
    g[1] === 0xff9b &&
    g[2] === 0 &&
    g[3] === 0 &&
    g[4] === 0 &&
    g[5] === 0
  ) {
    return isPrivateIpv4Octets((g[6] >> 8) & 0xff, g[6] & 0xff, (g[7] >> 8) & 0xff);
  }

  // fc00::/7 (Unique Local, includes fd00:ec2::254)
  if ((g[0] & 0xfe00) === 0xfc00) return true;

  // fe80::/10 (Link-Local)
  if ((g[0] & 0xffc0) === 0xfe80) return true;

  // fec0::/10 (Site-Local)
  if ((g[0] & 0xffc0) === 0xfec0) return true;

  // ff00::/8 (Multicast)
  if ((g[0] & 0xff00) === 0xff00) return true;

  // 2001:db8::/32 (Documentation)
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;

  return false;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const withoutZone = ip.trim().split("%")[0]?.toLowerCase() ?? "";
  if (!withoutZone) return true;

  const ipType = net.isIP(withoutZone);
  if (ipType === 4) return isPrivateIpv4(withoutZone);
  if (ipType === 6) return isPrivateIpv6(withoutZone);

  return true;
}

const BLOCKED_LOCAL_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

export interface ValidatedHostAddress {
  address: string;
  family: 4 | 6;
}

async function resolve4WithTimeout(host: string, timeoutMs: number): Promise<string[]> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const ips = await Promise.race([
      dns.promises.resolve4(host),
      new Promise<string[]>((resolve) => {
        timer = setTimeout(() => resolve([]), timeoutMs);
      }),
    ]);
    return Array.isArray(ips) ? ips : [];
  } catch {
    return [];
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

export interface ResolveHostsOptions {
  enrichIpv4?: boolean;
}

export interface PureTimedHostResolution {
  candidates: ValidatedHostAddress[];
  pureLookupMs: number | null;
}

export async function resolveValidatedHostsDetailed(
  hostname: string,
  allowPrivate: boolean,
  timeoutMs = 2500,
  options?: ResolveHostsOptions
): Promise<PureTimedHostResolution> {
  const enrichIpv4 = options?.enrichIpv4 ?? true;
  const cleanHost = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");

  if (
    !allowPrivate &&
    (BLOCKED_LOCAL_HOSTNAMES.has(cleanHost) || cleanHost.endsWith(".localhost"))
  ) {
    throw new NetworkGuardError(
      `Access to restricted hostname "${cleanHost}" is blocked by SSRF policy.`,
      403,
      "SSRF_BLOCKED"
    );
  }

  const literalIpType = net.isIP(cleanHost);
  if (literalIpType === 4 || literalIpType === 6) {
    if (!allowPrivate && isPrivateOrReservedIp(cleanHost)) {
      throw new NetworkGuardError(
        `Access to private or reserved IP (${cleanHost}) is blocked by SSRF policy.`,
        403,
        "SSRF_BLOCKED"
      );
    }
    return {
      candidates: [
        {
          address: cleanHost,
          family: literalIpType,
        },
      ],
      pureLookupMs: null,
    };
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let records: dns.LookupAddress[];
  const lookupStart = performance.now();

  try {
    records = await Promise.race([
      dns.promises.lookup(cleanHost, { all: true, verbatim: false }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new NetworkGuardError(
              `DNS resolution timed out after ${timeoutMs}ms for "${cleanHost}".`,
              504,
              "DNS_TIMEOUT"
            )
          );
        }, timeoutMs);
      }),
    ]);
  } catch (err) {
    if (err instanceof NetworkGuardError) {
      throw err;
    }
    throw new NetworkGuardError(
      `DNS lookup failed for "${cleanHost}". Verify the domain exists and is reachable.`,
      422,
      "DNS_FAILED"
    );
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }

  // Stop pure lookup timer immediately BEFORE any optional secondary Anycast A-record enrichment
  const pureLookupMs = Number(Math.max(0, performance.now() - lookupStart).toFixed(1));

  if (!Array.isArray(records) || records.length === 0) {
    throw new NetworkGuardError(
      `No DNS address records found for "${cleanHost}".`,
      422,
      "DNS_FAILED"
    );
  }

  const combinedRecords: dns.LookupAddress[] = [...records];
  if (enrichIpv4) {
    const initialIpv4Count = new Set(
      records.filter((r) => r.family === 4).map((r) => r.address)
    ).size;
    if (initialIpv4Count < 2) {
      const extraIpv4s = await resolve4WithTimeout(cleanHost, 800);
      for (const ip of extraIpv4s) {
        if (net.isIPv4(ip)) {
          combinedRecords.push({ address: ip, family: 4 });
        }
      }
    }
  }

  if (!allowPrivate) {
    for (const entry of combinedRecords) {
      if (isPrivateOrReservedIp(entry.address)) {
        throw new NetworkGuardError(
          `Access to private or reserved IP (${entry.address}) is blocked by SSRF policy.`,
          403,
          "SSRF_BLOCKED"
        );
      }
    }
  }

  const seen = new Set<string>();
  const ipv4List: ValidatedHostAddress[] = [];
  const ipv6List: ValidatedHostAddress[] = [];

  for (const entry of combinedRecords) {
    const addr = entry.address.trim();
    if (!addr || seen.has(addr)) continue;
    seen.add(addr);
    const family: 4 | 6 = entry.family === 6 ? 6 : 4;
    if (family === 4) {
      ipv4List.push({ address: addr, family: 4 });
    } else {
      ipv6List.push({ address: addr, family: 6 });
    }
  }

  const ordered = [...ipv4List, ...ipv6List];
  if (ordered.length === 0) {
    throw new NetworkGuardError(
      `No DNS address records found for "${cleanHost}".`,
      422,
      "DNS_FAILED"
    );
  }
  return {
    candidates: ordered,
    pureLookupMs,
  };
}

export async function resolveAllValidatedHosts(
  hostname: string,
  allowPrivate: boolean,
  timeoutMs = 2500,
  options?: ResolveHostsOptions
): Promise<ValidatedHostAddress[]> {
  const res = await resolveValidatedHostsDetailed(hostname, allowPrivate, timeoutMs, options);
  return res.candidates;
}

export async function selectReachableHost(
  candidates: ValidatedHostAddress[],
  port = 443,
  probeTimeoutMs = 1400
): Promise<ValidatedHostAddress> {
  if (candidates.length <= 1) {
    return candidates[0];
  }

  const probeTargets = candidates.slice(0, 3);
  return new Promise((resolve) => {
    let settled = false;
    let remaining = probeTargets.length;
    const sockets: net.Socket[] = [];

    const cleanupSockets = () => {
      for (const s of sockets) {
        if (s.listenerCount("error") === 0) {
          s.on("error", () => {});
        }
        if (!s.destroyed) {
          s.destroy();
        }
      }
    };

    const resolveWinner = (winner: ValidatedHostAddress) => {
      if (settled) return;
      settled = true;
      cleanupSockets();
      resolve(winner);
    };

    const onProbeFailed = () => {
      remaining -= 1;
      if (remaining <= 0 && !settled) {
        resolveWinner(candidates[0]);
      }
    };

    for (const candidate of probeTargets) {
      const socket = new net.Socket();
      sockets.push(socket);
      let candidateSettled = false;

      const failCandidate = () => {
        if (candidateSettled) return;
        candidateSettled = true;
        if (socket.listenerCount("error") === 0) {
          socket.on("error", () => {});
        }
        socket.destroy();
        onProbeFailed();
      };

      socket.setTimeout(probeTimeoutMs);

      socket.once("connect", () => {
        candidateSettled = true;
        resolveWinner(candidate);
      });

      socket.once("timeout", () => {
        failCandidate();
      });

      socket.on("error", (err: NodeJS.ErrnoException) => {
        // ECONNREFUSED proves the host is reachable on the network (e.g. port 80 HTTP-only server)
        if (err.code === "ECONNREFUSED") {
          candidateSettled = true;
          resolveWinner(candidate);
          return;
        }
        failCandidate();
      });

      socket.connect(port, candidate.address);
    }
  });
}

export async function resolveAndValidateHost(
  hostname: string,
  allowPrivate: boolean,
  timeoutMs = 2500
): Promise<ValidatedHostAddress> {
  const hosts = await resolveAllValidatedHosts(hostname, allowPrivate, timeoutMs);
  return hosts[0];
}

export function createPinnedLookup(resolvedIp: string, family: 4 | 6): net.LookupFunction {
  return ((
    _hostname: string,
    options: dns.LookupOptions | number | undefined,
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | dns.LookupAddress[],
      family?: number
    ) => void
  ) => {
    if (typeof options === "object" && options !== null && options.all) {
      process.nextTick(() => callback(null, [{ address: resolvedIp, family }]));
    } else {
      process.nextTick(() => callback(null, resolvedIp, family));
    }
  }) as net.LookupFunction;
}
