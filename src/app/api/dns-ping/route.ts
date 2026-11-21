import { NextRequest, NextResponse } from "next/server";
import dns from "dns";
import net from "net";
import https from "https";
import http from "http";
import { performance } from "perf_hooks";
import { parseTargetHost } from "@/lib/validators";
import {
  isCloudEnvironment,
  isPrivateTargetsAllowed,
  NetworkGuardError,
  resolveAllValidatedHosts,
  selectReachableHost,
} from "@/lib/network-guard";
import type {
  DnsPingResult,
  DnsRecordsBundle,
  DnsRecordTypeKey,
  LatencyPulse,
  LatencyStats,
} from "@/types/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SinglePulseTiming {
  dnsMs: number | null;
  tcpMs: number | null;
  tlsMs: number | null;
  ttfbMs: number;
  totalMs: number;
  statusCode: number;
}

function measureSocketLifecycle(
  hostname: string,
  useHttps: boolean,
  isIp: boolean,
  pulseIndex: number,
  allowPrivate: boolean,
  initialTarget: { address: string; family: 4 | 6 },
  coldDnsMs: number | null,
  timeoutMs: number
): Promise<SinglePulseTiming> {
  return new Promise((resolve, reject) => {
    const reqStart = performance.now();
    const mod = useHttps ? https : http;
    const port = useHttps ? 443 : 80;
    const servername = useHttps && !net.isIP(hostname) ? hostname : undefined;

    let lookupStartTime: number | null = null;
    let lookupEndTime: number | null = null;
    let connectTime: number | null = null;
    let secureConnectTime: number | null = null;
    let customLookupDurationMs: number | null = null;
    let settled = false;

    const customLookup = ((
      _host: string,
      options: dns.LookupOptions | number | undefined,
      callback: (
        err: NodeJS.ErrnoException | null,
        address: string | dns.LookupAddress[],
        family?: number
      ) => void
    ) => {
      const replySuccess = (addr: string, fam: 4 | 6) => {
        if (typeof options === "object" && options !== null && options.all) {
          callback(null, [{ address: addr, family: fam }]);
        } else {
          callback(null, addr, fam);
        }
      };

      if (isIp || pulseIndex === 1) {
        process.nextTick(() => {
          lookupEndTime = performance.now();
          replySuccess(initialTarget.address, initialTarget.family);
        });
        return;
      }

      lookupStartTime = performance.now();
      resolveAllValidatedHosts(hostname, allowPrivate, Math.min(2000, timeoutMs))
        .then((res) => {
          lookupEndTime = performance.now();
          customLookupDurationMs = Number(
            Math.max(0, lookupEndTime - (lookupStartTime ?? lookupEndTime)).toFixed(1)
          );
          const preferred =
            res.find((entry) => entry.address === initialTarget.address) ?? res[0];
          replySuccess(preferred.address, preferred.family);
        })
        .catch((err) => {
          lookupEndTime = performance.now();
          callback(err as NodeJS.ErrnoException, "");
        });
    }) as net.LookupFunction;

    const req = mod.request(
      {
        hostname,
        port,
        path: "/",
        method: "GET",
        timeout: timeoutMs,
        rejectUnauthorized: false,
        agent: false,
        lookup: customLookup,
        ...(servername ? { servername } : {}),
        headers: {
          "User-Agent": "NetPulse-Desktop/1.0",
          "Accept-Encoding": "identity",
          Connection: "close",
        },
      },
      (res) => {
        if (settled) {
          res.on("error", () => {});
          res.resume();
          res.destroy();
          return;
        }
        settled = true;

        const responseTime = performance.now();
        const dnsMs = isIp
          ? null
          : pulseIndex === 1
            ? coldDnsMs
            : customLookupDurationMs;

        const tcpBaseline = lookupEndTime ?? reqStart;
        const tcpMs =
          connectTime !== null
            ? Number(Math.max(0, connectTime - tcpBaseline).toFixed(1))
            : null;

        const tlsMs =
          useHttps && secureConnectTime !== null && connectTime !== null
            ? Number(Math.max(0, secureConnectTime - connectTime).toFixed(1))
            : null;

        const ttfbBaseline = useHttps
          ? (secureConnectTime ?? connectTime ?? tcpBaseline)
          : (connectTime ?? tcpBaseline);
        const ttfbMs = Number(Math.max(0, responseTime - ttfbBaseline).toFixed(1));

        const totalMs = Number(
          ((dnsMs ?? 0) + (tcpMs ?? 0) + (tlsMs ?? 0) + ttfbMs).toFixed(1)
        );

        const statusCode = res.statusCode ?? 0;

        res.on("error", () => {});
        res.resume();
        res.destroy();

        resolve({
          dnsMs,
          tcpMs,
          tlsMs,
          ttfbMs,
          totalMs,
          statusCode,
        });
      }
    );

    req.on("socket", (socket) => {
      if (socket.listenerCount("error") === 0) {
        socket.on("error", () => {});
      }
      socket.once("lookup", () => {
        if (lookupEndTime === null) {
          lookupEndTime = performance.now();
        }
      });
      socket.once("connect", () => {
        connectTime = performance.now();
      });
      if (useHttps) {
        socket.once("secureConnect", () => {
          secureConnectTime = performance.now();
        });
      }
    });

    req.once("timeout", () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms.`));
    });

    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    req.end();
  });
}

async function measureSinglePulse(
  index: number,
  hostname: string,
  isIp: boolean,
  allowPrivate: boolean,
  initialTarget: { address: string; family: 4 | 6 },
  coldDnsMs: number | null,
  remainingMs: number
): Promise<LatencyPulse> {
  const pulseTimeout = Math.min(3500, Math.max(800, remainingMs));

  try {
    const timing = await measureSocketLifecycle(
      hostname,
      true,
      isIp,
      index,
      allowPrivate,
      initialTarget,
      coldDnsMs,
      pulseTimeout
    );

    return {
      index,
      timestamp: new Date().toISOString(),
      dnsMs: timing.dnsMs,
      tcpMs: timing.tcpMs,
      tlsMs: timing.tlsMs,
      ttfbMs: timing.ttfbMs,
      totalMs: timing.totalMs,
      statusCode: timing.statusCode,
      ok: true,
      error: null,
    };
  } catch (err) {
    if (err instanceof NetworkGuardError) {
      throw err;
    }

    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    // Fallback to plaintext HTTP (port 80) ONLY when port 443 refuses connections
    if (code === "ECONNREFUSED" && remainingMs >= 900) {
      try {
        const timing = await measureSocketLifecycle(
          hostname,
          false,
          isIp,
          index,
          allowPrivate,
          initialTarget,
          coldDnsMs,
          Math.min(2500, remainingMs)
        );
        return {
          index,
          timestamp: new Date().toISOString(),
          dnsMs: timing.dnsMs,
          tcpMs: timing.tcpMs,
          tlsMs: null,
          ttfbMs: timing.ttfbMs,
          totalMs: timing.totalMs,
          statusCode: timing.statusCode,
          ok: true,
          error: null,
        };
      } catch (httpErr) {
        if (httpErr instanceof NetworkGuardError) {
          throw httpErr;
        }
        return {
          index,
          timestamp: new Date().toISOString(),
          dnsMs: null,
          tcpMs: null,
          tlsMs: null,
          ttfbMs: null,
          totalMs: null,
          statusCode: null,
          ok: false,
          error: httpErr instanceof Error ? httpErr.message : "HTTP probe failed",
        };
      }
    }

    return {
      index,
      timestamp: new Date().toISOString(),
      dnsMs: null,
      tcpMs: null,
      tlsMs: null,
      ttfbMs: null,
      totalMs: null,
      statusCode: null,
      ok: false,
      error: err instanceof Error ? err.message : "Probe failed",
    };
  }
}

function computeStats(values: (number | null)[]): LatencyStats {
  const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (valid.length === 0) {
    return { min: null, avg: null, max: null, jitter: null };
  }

  let min = valid[0];
  let max = valid[0];
  let sum = 0;
  let jitterSum = 0;

  for (let i = 0; i < valid.length; i++) {
    const v = valid[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    if (i > 0) {
      jitterSum += Math.abs(v - valid[i - 1]);
    }
  }

  return {
    min: Number(min.toFixed(1)),
    avg: Number((sum / valid.length).toFixed(1)),
    max: Number(max.toFixed(1)),
    jitter: valid.length > 1 ? Number((jitterSum / (valid.length - 1)).toFixed(1)) : 0,
  };
}

const FALLBACK_DNS_CODES = new Set([
  "EREFUSED",
  "ETIMEOUT",
  "ESERVFAIL",
  "ECONNREFUSED",
  "SERVFAIL",
  "TIMEOUT",
]);

const NO_RECORD_DNS_CODES = new Set(["ENODATA", "ENOTFOUND"]);

function extractDnsErrorCode(err: unknown): string {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (typeof code === "string" && code.trim()) return code.trim().toUpperCase();
  if (err instanceof Error && err.message) return err.message.slice(0, 60);
  return "DNS_ERROR";
}

function isFallbackEligibleDnsError(err: unknown): boolean {
  const code = extractDnsErrorCode(err);
  if (NO_RECORD_DNS_CODES.has(code)) return false;
  return FALLBACK_DNS_CODES.has(code);
}

async function withRaceTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const timeoutErr = new Error(`DNS record query timed out after ${timeoutMs}ms`) as NodeJS.ErrnoException;
          timeoutErr.code = "ETIMEOUT";
          reject(timeoutErr);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

interface QueryDnsRecordsOutput {
  records: DnsRecordsBundle;
  queryMs: number;
  timedOut: boolean;
  resolverSource: "system" | "public-fallback";
  recordErrors: Partial<Record<DnsRecordTypeKey, string>>;
}

type ResolverLike = Pick<
  typeof dns.promises,
  "resolve4" | "resolve6" | "resolveMx" | "resolveTxt" | "resolveNs" | "resolveCname" | "resolveSoa"
>;

function runSingleRecordQuery(
  resolver: ResolverLike,
  type: DnsRecordTypeKey,
  hostname: string,
  timeoutMs: number
): Promise<unknown> {
  switch (type) {
    case "A":
      return withRaceTimeout(resolver.resolve4(hostname, { ttl: true }), timeoutMs);
    case "AAAA":
      return withRaceTimeout(resolver.resolve6(hostname, { ttl: true }), timeoutMs);
    case "MX":
      return withRaceTimeout(resolver.resolveMx(hostname), timeoutMs);
    case "TXT":
      return withRaceTimeout(resolver.resolveTxt(hostname), timeoutMs);
    case "NS":
      return withRaceTimeout(resolver.resolveNs(hostname), timeoutMs);
    case "CNAME":
      return withRaceTimeout(resolver.resolveCname(hostname), timeoutMs);
    case "SOA":
      return withRaceTimeout(resolver.resolveSoa(hostname), timeoutMs);
  }
}

async function queryDnsRecords(
  hostname: string,
  isIp: boolean,
  timeoutMs: number
): Promise<QueryDnsRecordsOutput> {
  const emptyRecords: DnsRecordsBundle = {
    A: isIp ? [{ address: hostname, ttl: 0 }] : [],
    AAAA: [],
    MX: [],
    TXT: [],
    NS: [],
    CNAME: [],
    SOA: null,
  };

  if (isIp) {
    return {
      records: emptyRecords,
      queryMs: 0,
      timedOut: false,
      resolverSource: "system",
      recordErrors: {},
    };
  }

  const recordTypes: DnsRecordTypeKey[] = ["A", "AAAA", "MX", "TXT", "NS", "CNAME", "SOA"];
  const dnsStart = performance.now();
  const sysBudget = Math.max(800, Math.min(timeoutMs, 2200));

  const initialResults = await Promise.allSettled(
    recordTypes.map((type) => runSingleRecordQuery(dns.promises, type, hostname, sysBudget))
  );

  const settledMap = new Map<DnsRecordTypeKey, PromiseSettledResult<unknown>>();
  const fallbackTypes: DnsRecordTypeKey[] = [];

  recordTypes.forEach((type, idx) => {
    const res = initialResults[idx];
    settledMap.set(type, res);
    if (res.status === "rejected" && isFallbackEligibleDnsError(res.reason)) {
      fallbackTypes.push(type);
    }
  });

  let resolverSource: "system" | "public-fallback" = "system";

  if (fallbackTypes.length > 0) {
    const fallbackResolver = new dns.promises.Resolver();
    fallbackResolver.setServers(["1.1.1.1", "8.8.8.8"]);
    const fbBudget = Math.max(900, Math.min(2500, timeoutMs));

    const fbResults = await Promise.allSettled(
      fallbackTypes.map((type) => runSingleRecordQuery(fallbackResolver, type, hostname, fbBudget))
    );

    fallbackTypes.forEach((type, idx) => {
      const fbRes = fbResults[idx];
      if (fbRes.status === "fulfilled") {
        settledMap.set(type, fbRes);
        resolverSource = "public-fallback";
      } else {
        const fbCode = extractDnsErrorCode(fbRes.reason);
        if (NO_RECORD_DNS_CODES.has(fbCode)) {
          settledMap.set(type, fbRes);
          resolverSource = "public-fallback";
        }
      }
    });
  }

  const queryMs = Number((performance.now() - dnsStart).toFixed(1));
  const recordErrors: Partial<Record<DnsRecordTypeKey, string>> = {};
  let timedOut = false;

  for (const type of recordTypes) {
    const res = settledMap.get(type);
    if (res && res.status === "rejected") {
      const code = extractDnsErrorCode(res.reason);
      if (!NO_RECORD_DNS_CODES.has(code)) {
        recordErrors[type] = code;
        if (code === "ETIMEOUT" || code === "TIMEOUT") {
          timedOut = true;
        }
      }
    }
  }

  const aRes = settledMap.get("A");
  const aaaaRes = settledMap.get("AAAA");
  const mxRes = settledMap.get("MX");
  const txtRes = settledMap.get("TXT");
  const nsRes = settledMap.get("NS");
  const cnameRes = settledMap.get("CNAME");
  const soaRes = settledMap.get("SOA");

  return {
    queryMs,
    timedOut,
    resolverSource,
    recordErrors,
    records: {
      A:
        aRes?.status === "fulfilled"
          ? (aRes.value as dns.RecordWithTtl[]).map((r) => ({ address: r.address, ttl: r.ttl }))
          : [],
      AAAA:
        aaaaRes?.status === "fulfilled"
          ? (aaaaRes.value as dns.RecordWithTtl[]).map((r) => ({ address: r.address, ttl: r.ttl }))
          : [],
      MX:
        mxRes?.status === "fulfilled"
          ? [...(mxRes.value as dns.MxRecord[])].sort((a, b) => a.priority - b.priority)
          : [],
      TXT:
        txtRes?.status === "fulfilled"
          ? (txtRes.value as string[][]).map((chunks) => chunks.join(""))
          : [],
      NS: nsRes?.status === "fulfilled" ? (nsRes.value as string[]) : [],
      CNAME: cnameRes?.status === "fulfilled" ? (cnameRes.value as string[]) : [],
      SOA: soaRes?.status === "fulfilled" ? (soaRes.value as dns.SoaRecord) : null,
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { target?: unknown; pulses?: unknown };
    const parsed = parseTargetHost(body.target);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { hostname, raw, isIp } = parsed.data;
    const requestedPulses = typeof body.pulses === "number" ? body.pulses : 6;
    const pulsesCount = Math.min(10, Math.max(3, Math.round(requestedPulses)));

    const allowPrivate = isPrivateTargetsAllowed();
    const budgetMs = isCloudEnvironment() ? 8500 : 18000;
    const deadline = performance.now() + budgetMs;

    // 1. Measure initial cold DNS lookup BEFORE running parallel record queries (avoids warm cache bias)
    const coldDnsStart = performance.now();
    const initialCandidates = await resolveAllValidatedHosts(hostname, allowPrivate, 2500);
    const coldDnsMs = isIp ? null : Number((performance.now() - coldDnsStart).toFixed(1));
    const initialTarget = await selectReachableHost(initialCandidates, 443, 1400);
    const resolvedIp = initialTarget.address;

    // 2. Run consecutive single-socket lifecycle latency pulses within timeout budget (reserve time for zone query + fallback)
    const recordReserve = isCloudEnvironment() ? 1800 : 3500;
    const pulses: LatencyPulse[] = [];
    let timedOut = false;

    for (let i = 1; i <= pulsesCount; i++) {
      const remainingForPulses = Math.floor(deadline - performance.now() - recordReserve);
      if (remainingForPulses < 1200) {
        timedOut = true;
        break;
      }

      const pulse = await measureSinglePulse(
        i,
        hostname,
        isIp,
        allowPrivate,
        initialTarget,
        coldDnsMs,
        remainingForPulses
      );
      pulses.push(pulse);

      if (i < pulsesCount) {
        const remainingAfter = Math.floor(deadline - performance.now() - recordReserve);
        if (remainingAfter > 200) {
          await sleep(80);
        }
      }
    }

    // 3. Query full DNS zone records AFTER latency pulses complete
    const recordBudget = Math.min(3500, Math.max(900, Math.floor(deadline - performance.now())));
    const dnsBundle = await queryDnsRecords(hostname, isIp, recordBudget);
    if (dnsBundle.timedOut) {
      timedOut = true;
    }

    const okPulses = pulses.filter((p) => p.ok);
    const failedCount = pulses.length - okPulses.length;
    const packetLossPercent =
      pulses.length > 0 ? Math.round((failedCount / pulses.length) * 100) : 100;

    const result: DnsPingResult = {
      target: raw,
      hostname,
      resolvedIp,
      scannedAt: new Date().toISOString(),
      dnsTotalQueryMs: dnsBundle.queryMs,
      resolverSource: dnsBundle.resolverSource,
      ...(Object.keys(dnsBundle.recordErrors).length > 0
        ? { recordErrors: dnsBundle.recordErrors }
        : {}),
      records: dnsBundle.records,
      pulses,
      stats: {
        dns: computeStats(okPulses.map((p) => p.dnsMs)),
        tcp: computeStats(okPulses.map((p) => p.tcpMs)),
        tls: computeStats(okPulses.map((p) => p.tlsMs)),
        ttfb: computeStats(okPulses.map((p) => p.ttfbMs)),
        total: computeStats(okPulses.map((p) => p.totalMs)),
        packetLossPercent,
      },
      ...(timedOut ? { timedOut: true } : {}),
    };

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NetworkGuardError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : "Unexpected error during DNS radar.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
