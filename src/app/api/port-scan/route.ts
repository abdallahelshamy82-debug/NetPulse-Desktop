import { NextRequest, NextResponse } from "next/server";
import net from "net";
import { performance } from "perf_hooks";
import { parsePortListStrict, parseTargetHost } from "@/lib/validators";
import {
  getProbeVantage,
  isCloudEnvironment,
  isPrivateTargetsAllowed,
  NetworkGuardError,
  resolveAllValidatedHosts,
} from "@/lib/network-guard";
import { enforceCloudRateLimit } from "@/lib/rate-limit";
import type {
  PortScanItem,
  PortScanResult,
  PortScanTimeoutMode,
  PortStatus,
} from "@/types/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface PortMeta {
  service: string;
  risk: "info" | "low" | "medium" | "high";
  noteKey: string;
}

const KNOWN_PORTS: Record<number, PortMeta> = {
  21: { service: "FTP", risk: "medium", noteKey: "ftp" },
  22: { service: "SSH", risk: "medium", noteKey: "ssh" },
  25: { service: "SMTP", risk: "low", noteKey: "smtp" },
  53: { service: "DNS", risk: "info", noteKey: "dns" },
  80: { service: "HTTP", risk: "info", noteKey: "http" },
  443: { service: "HTTPS", risk: "info", noteKey: "https" },
  1433: { service: "MSSQL", risk: "high", noteKey: "mssql" },
  3000: { service: "Dev / Node.js", risk: "medium", noteKey: "dev3000" },
  3306: { service: "MySQL", risk: "high", noteKey: "mysql" },
  5432: { service: "PostgreSQL", risk: "high", noteKey: "postgres" },
  6379: { service: "Redis", risk: "high", noteKey: "redis" },
  8080: { service: "HTTP-Alt / Proxy", risk: "medium", noteKey: "httpAlt" },
  8443: { service: "HTTPS-Alt", risk: "low", noteKey: "httpsAlt" },
  27017: { service: "MongoDB", risk: "high", noteKey: "mongodb" },
};

function getPortMeta(port: number): PortMeta {
  return (
    KNOWN_PORTS[port] ?? {
      service: `TCP/${port}`,
      risk: "low" as const,
      noteKey: "custom",
    }
  );
}

function extractSafeBanner(rawBuf: Buffer, port: number): string | null {
  if (!rawBuf || rawBuf.length === 0) return null;
  const text = rawBuf
    .subarray(0, 512)
    .toString("latin1")
    .replace(/[^\x20-\x7e\r\n]/g, " ")
    .trim();
  if (!text) return null;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  if (/^HTTP\/\d/i.test(lines[0])) {
    const statusLine = lines[0].slice(0, 40);
    const serverLine = lines.find((l) => /^server\s*:/i.test(l));
    if (serverLine) {
      const srv = serverLine.replace(/^server\s*:\s*/i, "").trim().slice(0, 34);
      return srv ? `${statusLine} • ${srv}` : statusLine;
    }
    return statusLine;
  }

  if (port === 3306 && lines[0].length > 4) {
    const verMatch = /([0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9._-]+)?)/.exec(text);
    if (verMatch) return `MySQL ${verMatch[1].slice(0, 40)}`;
  }

  return lines[0].replace(/\s+/g, " ").slice(0, 68);
}

const TLS_SKIP_BANNER_PORTS = new Set([443, 8443]);
const HTTP_PROBE_BANNER_PORTS = new Set([80, 3000, 8080]);

function probeTcpPort(
  host: string,
  hostnameHeader: string,
  port: number,
  timeoutMs: number
): Promise<PortScanItem> {
  return new Promise((resolve) => {
    const meta = getPortMeta(port);
    const start = performance.now();
    const socket = new net.Socket();
    let settled = false;
    let connectLatencyMs: number | null = null;
    let bannerTimer: ReturnType<typeof setTimeout> | null = null;

    const done = (
      status: PortStatus,
      errorCode: string | null,
      includeLatency: boolean,
      banner: string | null = null
    ) => {
      if (settled) return;
      settled = true;
      if (bannerTimer !== null) {
        clearTimeout(bannerTimer);
        bannerTimer = null;
      }
      const latencyMs = includeLatency
        ? (connectLatencyMs ?? Number((performance.now() - start).toFixed(1)))
        : null;

      if (socket.listenerCount("error") === 0) {
        socket.on("error", () => {});
      }
      socket.destroy();

      resolve({
        port,
        service: meta.service,
        protocol: "TCP",
        status,
        latencyMs,
        ...(banner ? { banner } : {}),
        errorCode,
        risk: meta.risk,
        noteKey: meta.noteKey,
      });
    };

    socket.setTimeout(timeoutMs);

    socket.once("connect", () => {
      connectLatencyMs = Number((performance.now() - start).toFixed(1));
      if (TLS_SKIP_BANNER_PORTS.has(port)) {
        done("open", null, true, null);
        return;
      }

      const chunks: Buffer[] = [];
      let totalLen = 0;

      socket.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        totalLen += chunk.length;
        if (totalLen >= 160) {
          const banner = extractSafeBanner(Buffer.concat(chunks), port);
          done("open", null, true, banner);
        }
      });

      socket.once("end", () => {
        const banner = chunks.length > 0 ? extractSafeBanner(Buffer.concat(chunks), port) : null;
        done("open", null, true, banner);
      });

      bannerTimer = setTimeout(() => {
        const banner = chunks.length > 0 ? extractSafeBanner(Buffer.concat(chunks), port) : null;
        done("open", null, true, banner);
      }, 260);

      if (HTTP_PROBE_BANNER_PORTS.has(port)) {
        try {
          const safeHost = hostnameHeader.replace(/[^a-zA-Z0-9.:[\]-]/g, "");
          socket.write(`HEAD / HTTP/1.0\r\nHost: ${safeHost}\r\nConnection: close\r\n\r\n`);
        } catch {
          // Ignore write errors after connect
        }
      }
    });

    socket.once("timeout", () => {
      if (connectLatencyMs !== null) {
        done("open", null, true, null);
        return;
      }
      done("filtered", "TIMEOUT", true);
    });

    socket.on("error", (err: NodeJS.ErrnoException) => {
      if (connectLatencyMs !== null) {
        done("open", null, true, null);
        return;
      }
      const code = err.code ?? "SOCKET_ERROR";
      if (code === "ECONNREFUSED") {
        done("closed", code, true);
      } else if (code === "ETIMEDOUT" || code === "EHOSTUNREACH" || code === "EHOSTDOWN") {
        done("filtered", code, true);
      } else {
        done("error", code, false);
      }
    });

    socket.connect(port, host);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithPacedConcurrency<T, R>(
  items: T[],
  limit: number,
  staggerMs: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let nextLaunchAt = performance.now() + staggerMs;

  async function runWorker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      if (staggerMs > 0 && current > 0) {
        const now = performance.now();
        const scheduledAt = Math.max(now, nextLaunchAt);
        nextLaunchAt = scheduledAt + staggerMs;
        const waitMs = scheduledAt - now;
        if (waitMs > 1) {
          await delay(waitMs);
        }
      }
      results[current] = await worker(items[current]);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

export async function POST(req: NextRequest) {
  try {
    const rateLimited = enforceCloudRateLimit(req, "ports", 12);
    if (rateLimited) return rateLimited;

    const body = (await req.json()) as {
      target?: unknown;
      ports?: unknown;
      timeoutMs?: unknown;
      timeoutMode?: unknown;
    };

    const parsed = parseTargetHost(body.target);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const parsedPorts = parsePortListStrict(body.ports);
    if (!parsedPorts.ok) {
      return NextResponse.json({ error: parsedPorts.error }, { status: 400 });
    }

    const { hostname, raw, isIp } = parsed.data;
    const ports = parsedPorts.ports;
    const isCloud = isCloudEnvironment();
    const timeoutMode: PortScanTimeoutMode = body.timeoutMode === "deep" ? "deep" : "fast";
    const defaultTimeoutMs = timeoutMode === "deep" ? (isCloud ? 2500 : 3500) : 1800;
    const requestedTimeoutMs =
      typeof body.timeoutMs === "number" && body.timeoutMs >= 300 && body.timeoutMs <= 4500
        ? Math.min(Math.round(body.timeoutMs), isCloud ? 2500 : 4500)
        : defaultTimeoutMs;

    const allowPrivate = isPrivateTargetsAllowed();
    const budgetMs = isCloud ? 8500 : 24000;
    const deadline = performance.now() + budgetMs;

    const candidates = (await resolveAllValidatedHosts(hostname, allowPrivate, 2500)).slice(0, 3);
    const criticalPorts = [443, 80].filter((p) => ports.includes(p));
    const otherPorts = ports.filter((p) => p !== 443 && p !== 80).sort((a, b) => a - b);

    const scanStart = performance.now();
    let timedOut = false;

    const probeOneWithBudget = async (ip: string, port: number): Promise<PortScanItem> => {
      const remaining = Math.floor(deadline - performance.now());
      if (remaining < 300) {
        timedOut = true;
        const meta = getPortMeta(port);
        return {
          port,
          service: meta.service,
          protocol: "TCP",
          status: "filtered",
          latencyMs: null,
          errorCode: "BUDGET_EXCEEDED",
          risk: meta.risk,
          noteKey: meta.noteKey,
        };
      }

      return probeTcpPort(ip, hostname, port, Math.min(requestedTimeoutMs, remaining));
    };

    let activeIp = candidates[0].address;
    let finalResults: PortScanItem[] = [];

    for (let idx = 0; idx < candidates.length; idx++) {
      const ip = candidates[idx].address;
      const hasNext = idx + 1 < candidates.length;
      activeIp = ip;

      let criticalResults: PortScanItem[] = [];
      if (criticalPorts.length > 0) {
        criticalResults = await runWithPacedConcurrency(criticalPorts, 2, 60, (port) =>
          probeOneWithBudget(ip, port)
        );

        const allCriticalTimedOut =
          criticalResults.length > 0 &&
          criticalResults.every(
            (r) => r.status === "filtered" && r.errorCode !== "BUDGET_EXCEEDED"
          );

        if (allCriticalTimedOut && hasNext && deadline - performance.now() >= 2500) {
          continue;
        }

        if (!isIp) {
          for (let i = 0; i < criticalResults.length; i++) {
            const item = criticalResults[i];
            if (
              item.status === "filtered" &&
              item.errorCode !== "BUDGET_EXCEEDED" &&
              deadline - performance.now() >= 900
            ) {
              criticalResults[i] = await probeOneWithBudget(ip, item.port);
            }
          }
        }
      }

      const otherResults =
        otherPorts.length > 0
          ? await runWithPacedConcurrency(otherPorts, 3, 60, (port) =>
              probeOneWithBudget(ip, port)
            )
          : [];

      const allOtherTimedOut =
        criticalPorts.length === 0 &&
        otherResults.length > 0 &&
        otherResults.every(
          (r) => r.status === "filtered" && r.errorCode !== "BUDGET_EXCEEDED"
        );

      if (allOtherTimedOut && hasNext && deadline - performance.now() >= 2500) {
        continue;
      }

      finalResults = [...criticalResults, ...otherResults];
      break;
    }

    const durationMs = Math.round(performance.now() - scanStart);
    const sorted = [...finalResults].sort((a, b) => a.port - b.port);

    const summary = {
      total: sorted.length,
      open: sorted.filter((p) => p.status === "open").length,
      closed: sorted.filter((p) => p.status === "closed").length,
      filtered: sorted.filter((p) => p.status === "filtered").length,
      error: sorted.filter((p) => p.status === "error").length,
    };

    const payload: PortScanResult = {
      target: raw,
      hostname,
      resolvedIp: activeIp,
      scannedAt: new Date().toISOString(),
      probeVantage: getProbeVantage(),
      durationMs,
      timeoutMs: requestedTimeoutMs,
      ports: sorted,
      summary,
      ...(timedOut ? { timedOut: true } : {}),
    };

    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof NetworkGuardError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : "Unexpected error during port scan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
